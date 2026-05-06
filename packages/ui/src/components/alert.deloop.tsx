import { CheckCircle2Icon } from "lucide-react";

import { Alert as BaseAlert, AlertDescription, AlertTitle } from "./alert";

export function Alert() {
  return (
    <BaseAlert>
      <CheckCircle2Icon />
      <AlertTitle>Payment successful</AlertTitle>
      <AlertDescription>
        Your payment of $29.99 has been processed. A receipt has been sent to your email address.
      </AlertDescription>
    </BaseAlert>
  );
}
