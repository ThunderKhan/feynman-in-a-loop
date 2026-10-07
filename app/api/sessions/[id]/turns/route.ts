import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAIProvider } from "@/lib/ai/provider";
import { AIProviderError } from "@/lib/ai/errors";
import { selectTurnContext, type StoredTurn } from "@/lib/ai/context";
import {
  validateStudentBoundary,
  validateTurnOutput,
  TurnValidationError,
} from "@/lib/ai/validate";
import { TurnOutputSchema } from "@/lib/ai/schemas/turn";
import { validateTransition, MachineTransitionError } from "@/lib/ai/machine";
import { buildMasteryResult } from "@/lib/ai/result";
import type { LearningSession } from "@/lib/types";
import type {
  TurnInput,
  TurnOutput,
  ValidationResult,
} from "@/lib/ai/types";

const TurnRequestSchema = z
  .object({
    clientTurnId: z.string().uuid(),
    source: z.enum(["voice", "typed"]),
    content: z.string().trim().min(1).max(4000),
  })
  .strict();

type RouteContext = {
  params: Promise<{ id: string }>;
};

function errorResponse(
  status: number,
  code: string,
  message: string,
  retryable = false,
) {
  return NextResponse.json(
    { error: { code, message, retryable } },
    { status },
  );
}

function interactionTypeFor(action: TurnOutput["evaluation"]["nextAction"]) {
  switch (action) {
    case "clarify":
    case "probe":
      return "probe";
    case "misconception":
      return "misconception";
    case "transfer":
      return "transfer_test";
    case "assess":
    case "complete":
      return "assessment";
  }
}

async function releaseClaim(
  userId: string,
  sessionId: string,
  learnerTurnId: string,
) {
  const admin = createAdminClient();
  const { error } = await admin.rpc("release_model_call", {
    p_user_id: userId,
    p_session_id: sessionId,
    p_learner_turn_id: learnerTurnId,
  });

  if (error) {
    console.error("Failed to release model claim", {
      sessionId,
      learnerTurnId,
      message: error.message,
    });
  }
}

async function claimTurn(
  userId: string,
  sessionId: string,
  learnerTurnId: string,
) {
  const admin = createAdminClient();
  return admin.rpc("claim_model_call", {
    p_user_id: userId,
    p_session_id: sessionId,
    p_learner_turn_id: learnerTurnId,
  });
}

async function existingPublicResponse(
  supabase: Awaited<ReturnType<typeof createClient>>,
  session: LearningSession,
  learnerTurnId: string,
) {
  const { data: student } = await supabase
    .from("session_turns")
    .select("content")
    .eq("session_id", session.id)
    .eq("responds_to_turn_id", learnerTurnId)
    .eq("role", "student")
    .maybeSingle();

  if (!student) return null;

  return {
    publicStage: session.stage,
    student: {
      state: session.student_state ?? "ready",
      message: student.content,
    },
  };
}

async function callProvider(
  input: TurnInput,
): Promise<TurnOutput> {
  return getAIProvider().completeTurn(input);
}

async function fullRetry(args: {
  userId: string;
  sessionId: string;
  learnerTurnId: string;
  input: TurnInput;
  reason: string;
  validationContext: Parameters<typeof validateTurnOutput>[1];
}): Promise<ValidationResult> {
  await releaseClaim(args.userId, args.sessionId, args.learnerTurnId);

  const retryClaim = await claimTurn(
    args.userId,
    args.sessionId,
    args.learnerTurnId,
  );
  if (retryClaim.error) {
    throw new Error(`Could not claim validation retry: ${retryClaim.error.message}`);
  }

  let raw: TurnOutput;
  try {
    raw = await callProvider({
      ...args.input,
      mode: "retry",
      retryReason: args.reason,
    });
  } catch (error) {
    await releaseClaim(args.userId, args.sessionId, args.learnerTurnId);
    throw error;
  }

  try {
    return validateTurnOutput(raw, args.validationContext);
  } catch (error) {
    await releaseClaim(args.userId, args.sessionId, args.learnerTurnId);
    throw error;
  }
}

async function repairStudentOnly(args: {
  userId: string;
  sessionId: string;
  learnerTurnId: string;
  input: TurnInput;
  validated: ValidationResult;
  reason: string;
}): Promise<ValidationResult> {
  await releaseClaim(args.userId, args.sessionId, args.learnerTurnId);

  const retryClaim = await claimTurn(
    args.userId,
    args.sessionId,
    args.learnerTurnId,
  );
  if (retryClaim.error) {
    throw new Error(`Could not claim student-response repair: ${retryClaim.error.message}`);
  }

  let raw: TurnOutput;
  try {
    raw = await callProvider({
      ...args.input,
      mode: "student_repair",
      retryReason: args.reason,
      fixedEvaluation: args.validated.output.evaluation,
    });
  } catch (error) {
    await releaseClaim(args.userId, args.sessionId, args.learnerTurnId);
    throw error;
  }

  const parsed = TurnOutputSchema.safeParse(raw);
  if (!parsed.success) {
    await releaseClaim(args.userId, args.sessionId, args.learnerTurnId);
    throw new TurnValidationError(
      "Student-response repair returned malformed structured output.",
      "shape",
    );
  }

  const repaired: TurnOutput = {
    evaluation: args.validated.output.evaluation,
    student: parsed.data.student,
  };

  try {
    validateStudentBoundary(repaired);
  } catch (error) {
    await releaseClaim(args.userId, args.sessionId, args.learnerTurnId);
    throw error;
  }

  return {
    output: repaired,
    mergedLedger: args.validated.mergedLedger,
  };
}

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getUser();
  if (!user) {
    return errorResponse(401, "unauthorized", "Sign in to continue.");
  }

  const parsedBody = TurnRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsedBody.success) {
    return errorResponse(
      400,
      "invalid_turn",
      "Send a non-empty learner turn of at most 4000 characters.",
    );
  }

  const { id: sessionId } = await context.params;
  const supabase = await createClient();

  const { data: sessionRow, error: sessionError } = await supabase
    .from("learning_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError || !sessionRow) {
    return errorResponse(404, "session_not_found", "Session not found.");
  }

  let session = sessionRow as LearningSession;

  // Persist before model use. append_learner_turn is idempotent, including a
  // replay after the session completed due to a lost final HTTP response.
  const { data: learnerTurnId, error: appendError } = await supabase.rpc(
    "append_learner_turn",
    {
      p_session_id: sessionId,
      p_client_turn_id: parsedBody.data.clientTurnId,
      p_content: parsedBody.data.content,
      p_source: parsedBody.data.source,
    },
  );

  if (appendError || !learnerTurnId) {
    const completed = /completed|immutable/i.test(appendError?.message ?? "");
    return errorResponse(
      completed ? 409 : 400,
      completed ? "session_completed" : "turn_persist_failed",
      completed
        ? "This attempt is already complete."
        : appendError?.message ?? "Could not save the learner turn.",
    );
  }

  // Lost-response idempotency: if this learner turn already has its student
  // response, return it without claiming quota or contacting a model.
  const existing = await existingPublicResponse(
    supabase,
    session,
    learnerTurnId as string,
  );
  if (existing) return NextResponse.json(existing);

  if (session.status === "completed") {
    return errorResponse(409, "session_completed", "This attempt is complete.");
  }

  const { data: turnRows, error: turnsError } = await supabase
    .from("session_turns")
    .select("id, sequence, role, interaction_type, content")
    .eq("session_id", sessionId)
    .order("sequence", { ascending: true });

  if (turnsError || !turnRows) {
    return errorResponse(
      500,
      "context_load_failed",
      "Your turn was saved, but the session context could not be loaded.",
      true,
    );
  }

  // Refresh the session after persistence in case another request completed or
  // advanced it while this request was waiting.
  const { data: freshSession } = await supabase
    .from("learning_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();
  if (freshSession) session = freshSession as LearningSession;

  const selected = selectTurnContext(
    session,
    turnRows as StoredTurn[],
  );

  // Ensure the newest learner turn is always in model context, even if a
  // future selector change tightens the recent-turn window.
  const newest = (turnRows as StoredTurn[]).find(
    (turn) => turn.id === learnerTurnId,
  );
  if (
    newest &&
    !selected.turns.some((turn) => turn.id === newest.id)
  ) {
    selected.turns.push({
      id: newest.id,
      sequence: newest.sequence,
      role: newest.role,
      interactionType: newest.interaction_type,
      content: newest.content,
    });
  }

  const input: TurnInput = {
    ...selected,
    learnerTurnId: learnerTurnId as string,
    learnerContent: parsedBody.data.content,
    mode: "normal",
    retryReason: null,
    fixedEvaluation: null,
  };

  const validationContext = {
    sessionId,
    contextTurns: selected.turns,
    existingLedger: selected.evidenceLedger,
  };

  const claim = await claimTurn(user.id, sessionId, learnerTurnId as string);
  if (claim.error) {
    // A racing request may have applied the response between our earlier
    // idempotency check and this claim attempt.
    const { data: latestSession } = await supabase
      .from("learning_sessions")
      .select("*")
      .eq("id", sessionId)
      .single();
    if (latestSession) {
      const raced = await existingPublicResponse(
        supabase,
        latestSession as LearningSession,
        learnerTurnId as string,
      );
      if (raced) return NextResponse.json(raced);
    }

    return errorResponse(
      409,
      "evaluation_not_claimable",
      /cap reached/i.test(claim.error.message)
        ? "This attempt has reached its model-call limit."
        : "This turn is already being evaluated. Try again shortly.",
      true,
    );
  }

  let validated: ValidationResult;

  try {
    const raw = await callProvider(input);

    try {
      validated = validateTurnOutput(raw, validationContext);
    } catch (error) {
      if (!(error instanceof TurnValidationError)) throw error;

      if (error.gate === "boundary") {
        // Gate 1/2 already passed; keep the private evaluator result and repair
        // only the learner-facing student message.
        const shapeAndMeaning = validateTurnOutput(
          {
            ...raw,
            student: {
              ...raw.student,
              // Temporary safe placeholder solely to re-run Gates 1/2.
              message: "Could you explain that part another way?",
            },
          },
          validationContext,
        );

        validated = await repairStudentOnly({
          userId: user.id,
          sessionId,
          learnerTurnId: learnerTurnId as string,
          input,
          validated: shapeAndMeaning,
          reason: error.message,
        });
      } else {
        validated = await fullRetry({
          userId: user.id,
          sessionId,
          learnerTurnId: learnerTurnId as string,
          input,
          reason: error.message,
          validationContext,
        });
      }
    }
  } catch (error) {
    // Provider errors and the second failed validation leave the learner turn
    // persisted and retryable. The consumed model-call allowance is NOT
    // refunded by release_model_call.
    await releaseClaim(user.id, sessionId, learnerTurnId as string);

    if (error instanceof AIProviderError) {
      const status =
        error.code === "provider_not_configured"
          ? 503
          : error.status === 429
            ? 429
            : 502;
      return errorResponse(
        status,
        error.code,
        error.code === "provider_not_configured"
          ? "The AI provider is not configured yet."
          : "The AI student could not respond. Your teaching turn is saved.",
        true,
      );
    }

    if (
      error instanceof TurnValidationError ||
      error instanceof MachineTransitionError
    ) {
      return errorResponse(
        502,
        "invalid_ai_output",
        "The AI response failed validation. Your teaching turn is saved.",
        true,
      );
    }

    console.error("Turn evaluation failed", error);
    return errorResponse(
      502,
      "evaluation_failed",
      "The AI student could not finish this turn. Your teaching turn is saved.",
      true,
    );
  }

  let transition;
  try {
    transition = validateTransition({
      currentStage: session.stage,
      proposal: validated.output.evaluation,
      mergedLedger: validated.mergedLedger,
      contextTurns: selected.turns,
    });
  } catch (error) {
    await releaseClaim(user.id, sessionId, learnerTurnId as string);
    return errorResponse(
      502,
      "illegal_ai_transition",
      error instanceof Error
        ? "The AI proposed an invalid learning-state transition. Your turn is saved."
        : "The AI proposed an invalid state.",
      true,
    );
  }

  const finalStage = transition.persistedStage;
  const complete = transition.complete;
  const masteryResult = complete
    ? buildMasteryResult(
        validated.output.evaluation.dimensions,
        validated.mergedLedger,
      )
    : null;

  const activeTargetGap =
    finalStage === "diagnose" || finalStage === "repair"
      ? validated.output.evaluation.targetGap
      : null;

  const admin = createAdminClient();
  const { data: applied, error: applyError } = await admin.rpc(
    "apply_turn_result",
    {
      p_user_id: user.id,
      p_session_id: sessionId,
      p_learner_turn_id: learnerTurnId,
      p_student_state: validated.output.student.state,
      p_message: validated.output.student.message,
      p_interaction_type: interactionTypeFor(
        validated.output.evaluation.nextAction,
      ),
      p_stage: finalStage,
      p_mastery: validated.output.evaluation.dimensions,
      p_evidence_ledger: validated.mergedLedger,
      p_target_gap: activeTargetGap,
      p_complete: complete,
      p_mastery_result: masteryResult,
    },
  );

  if (applyError) {
    // If another request won the race, return the already-persisted response.
    const { data: latestSession } = await supabase
      .from("learning_sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    if (latestSession) {
      const raced = await existingPublicResponse(
        supabase,
        latestSession as LearningSession,
        learnerTurnId as string,
      );
      if (raced) return NextResponse.json(raced);
    }

    await releaseClaim(user.id, sessionId, learnerTurnId as string);
    console.error("apply_turn_result failed", {
      sessionId,
      learnerTurnId,
      message: applyError.message,
    });
    return errorResponse(
      500,
      "apply_failed",
      "The response could not be saved. Your teaching turn is still available to retry.",
      true,
    );
  }

  // apply_turn_result returns only the intentionally public projection.
  return NextResponse.json(applied);
}
