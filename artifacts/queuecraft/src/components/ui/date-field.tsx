import * as React from "react";
import { Input } from "@/components/ui/input";
import { displayDateToIso, isoDateToDisplay } from "@/lib/dates";

type DateFieldProps = Omit<
  React.ComponentProps<typeof Input>,
  "type" | "value" | "onChange"
> & {
  value?: string | null;
  onChange: (value: string) => void;
};

export const DateField = React.forwardRef<HTMLInputElement, DateFieldProps>(
  ({ value, onChange, onBlur, ...props }, forwardedRef) => {
    const [displayValue, setDisplayValue] = React.useState(() =>
      isoDateToDisplay(value),
    );
    const inputRef = React.useRef<HTMLInputElement | null>(null);

    React.useEffect(() => {
      setDisplayValue(isoDateToDisplay(value));
    }, [value]);

    const setRef = (element: HTMLInputElement | null) => {
      inputRef.current = element;
      if (typeof forwardedRef === "function") forwardedRef(element);
      else if (forwardedRef) forwardedRef.current = element;
    };

    const updateValue = (nextDisplayValue: string) => {
      setDisplayValue(nextDisplayValue);
      if (!nextDisplayValue) {
        inputRef.current?.setCustomValidity("");
        onChange("");
        return;
      }
      const isoValue = displayDateToIso(nextDisplayValue);
      inputRef.current?.setCustomValidity(
        isoValue ? "" : "Enter a valid date in DD/MM/YYYY format.",
      );
      if (isoValue) onChange(isoValue);
    };

    return (
      <Input
        {...props}
        ref={setRef}
        type="text"
        inputMode="numeric"
        placeholder="DD/MM/YYYY"
        maxLength={10}
        value={displayValue}
        onChange={(event) => updateValue(event.target.value)}
        onBlur={(event) => {
          if (displayValue && !displayDateToIso(displayValue)) {
            event.currentTarget.reportValidity();
          }
          onBlur?.(event);
        }}
      />
    );
  },
);

DateField.displayName = "DateField";