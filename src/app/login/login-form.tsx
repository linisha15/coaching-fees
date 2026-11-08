"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Labels = {
  phone: string;
  sendCode: string;
  code: string;
  codeSent: string;
  verify: string;
  changeNumber: string;
  devHint: string | null;
};

export function LoginForm({ labels }: { labels: Labels }) {
  const [state, action] = useActionState<LoginState, FormData>(loginAction, { step: "phone" });

  if (state.step === "phone") {
    return (
      <form action={action} className="mt-10 flex flex-col gap-3" noValidate>
        <input type="hidden" name="intent" value="send" />
        <Label htmlFor="phone" className="text-base">{labels.phone}</Label>
        <div className="flex items-center gap-2">
          <span className="text-lg text-muted-foreground">+91</span>
          <Input
            id="phone"
            name="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            maxLength={14}
            defaultValue={state.phone ?? ""}
            placeholder="98290 12345"
            aria-invalid={!!state.error}
            aria-describedby={state.error ? "phone-error" : undefined}
            className="h-14 text-xl tracking-wide"
            required
            autoFocus
          />
        </div>
        {state.error && <p id="phone-error" role="alert" className="text-base text-[var(--critical)]">{state.error}</p>}
        <SubmitButton className="mt-4 h-14 text-lg" pendingLabel="…">{labels.sendCode}</SubmitButton>
      </form>
    );
  }

  const shown = `+91 ${state.phone.slice(2, 7)} ${state.phone.slice(7)}`;
  return (
    <div className="mt-10">
      <form action={action} className="flex flex-col gap-3" noValidate>
        <input type="hidden" name="intent" value="verify" />
        <p className="text-base text-muted-foreground">
          {labels.codeSent} <span className="font-medium text-foreground">{shown}</span>
        </p>
        <Label htmlFor="code" className="mt-4 text-base">{labels.code}</Label>
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          aria-invalid={!!state.error}
          aria-describedby={state.error ? "code-error" : undefined}
          className="h-14 text-center text-2xl tracking-[0.5em]"
          required
          autoFocus
        />
        {state.error && <p id="code-error" role="alert" className="text-base text-[var(--critical)]">{state.error}</p>}
        {labels.devHint && <p className="text-sm text-muted-foreground">{labels.devHint}</p>}
        <SubmitButton className="mt-4 h-14 text-lg" pendingLabel="…">{labels.verify}</SubmitButton>
      </form>
      <form action={action} className="mt-2">
        <input type="hidden" name="intent" value="change" />
        <button type="submit" className="w-full py-3 text-base text-muted-foreground underline-offset-4 hover:underline">
          {labels.changeNumber}
        </button>
      </form>
    </div>
  );
}
