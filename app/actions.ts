"use server";

export type GateResult = {
  ok: boolean;
  message: string;
};

export type TrialResult = {
  ok: boolean;
  message: string;
  revealWord?: string;
};

const gateWord = "AZOTH";

const trialAnswers: Record<number, string[]> = {
  1: ["VISITA"],
  2: ["VITRIOL"],
  3: ["AZOTH"]
};

const gateDenials = [
  "The doors remain shut. You are not yet known.",
  "That is not the Word. The threshold grows colder.",
  "The Order does not repeat itself. Listen more carefully.",
  "No. The lock remains perfectly still."
];

function normalize(input: string) {
  return input.trim().toUpperCase().replace(/[^A-Z]/g, "");
}

export async function verifyGate(input: string, attempt = 0): Promise<GateResult> {
  const candidate = normalize(input);

  if (candidate === gateWord) {
    return {
      ok: true,
      message: "The bronze yields. Enter as one recognized."
    };
  }

  return {
    ok: false,
    message: gateDenials[Math.min(attempt, gateDenials.length - 1)]
  };
}

export async function verifyTrial(trial: number, input: string): Promise<TrialResult> {
  const candidate = normalize(input);
  const accepted = trialAnswers[trial] ?? [];

  if (!accepted.includes(candidate)) {
    return {
      ok: false,
      message: "Not yet. Look again."
    };
  }

  if (trial === 1) {
    return {
      ok: true,
      message: "Visita - descend. The first inscription has been made legible."
    };
  }

  if (trial === 2) {
    return {
      ok: true,
      message: "Vitriol - the green lion, the secret fire. The last seal is loosened."
    };
  }

  return {
    ok: true,
    message: "The residue remains. The Word is yours.",
    revealWord: gateWord
  };
}
