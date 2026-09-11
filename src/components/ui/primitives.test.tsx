// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Switch } from "./Switch";
import { Input } from "./Input";
import { ConfirmModal } from "./ConfirmModal";
import { ProgressBar } from "./ProgressBar";
import { DescriptionList } from "./DescriptionList";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "es" } }),
}));

afterEach(() => cleanup());

describe("Switch", () => {
  it("toggles on click", () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="Enabled" />);

    fireEvent.click(screen.getByRole("switch", { name: "Enabled" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("toggles with Space and Enter", () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="Enabled" />);
    const control = screen.getByRole("switch", { name: "Enabled" });

    fireEvent.keyDown(control, { key: " " });
    fireEvent.keyDown(control, { key: "Enter" });

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenNthCalledWith(1, true);
    expect(onChange).toHaveBeenNthCalledWith(2, true);
  });

  it("does not toggle when disabled", () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="Enabled" disabled />);

    fireEvent.click(screen.getByRole("switch", { name: "Enabled" }));

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("Input", () => {
  it("associates the label and exposes the error", () => {
    render(<Input label="Email" error="Required" hint="We never share it" />);

    const input = screen.getByLabelText("Email");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Required")).toBeDefined();
    expect(screen.queryByText("We never share it")).toBeNull();

    const describedBy = input.getAttribute("aria-describedby");
    expect(document.getElementById(describedBy as string)?.textContent).toBe("Required");
  });

  it("shows the hint when there is no error", () => {
    render(<Input label="Email" hint="Optional" />);

    const input = screen.getByLabelText("Email");
    expect(input.getAttribute("aria-invalid")).toBeNull();
    expect(screen.getByText("Optional")).toBeDefined();
  });
});

describe("ConfirmModal", () => {
  it("confirms and cancels", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <ConfirmModal
        isOpen
        onClose={onClose}
        onConfirm={onConfirm}
        title="Delete match"
        confirmLabel="Delete"
        cancelLabel="Keep"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("disables both actions while pending", () => {
    render(
      <ConfirmModal
        isOpen
        onClose={() => undefined}
        onConfirm={() => undefined}
        title="Delete match"
        confirmLabel="Delete"
        cancelLabel="Keep"
        isPending
      />,
    );

    expect(
      (screen.getByRole("button", { name: "Keep" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: /Delete/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

describe("ProgressBar", () => {
  it("exposes aria values", () => {
    render(<ProgressBar value={42} label="Boost" />);

    const bar = screen.getByRole("progressbar", { name: "Boost" });
    expect(bar.getAttribute("aria-valuenow")).toBe("42");
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    expect(bar.getAttribute("aria-valuemax")).toBe("100");
  });

  it("supports a custom max", () => {
    render(<ProgressBar value={150} max={200} aria-label="XP" variant="success" />);

    const bar = screen.getByRole("progressbar", { name: "XP" });
    expect(bar.getAttribute("aria-valuenow")).toBe("150");
    expect(bar.getAttribute("aria-valuemax")).toBe("200");
  });
});

describe("DescriptionList", () => {
  it("renders labels and values", () => {
    render(
      <DescriptionList
        items={[
          { label: "Rank", value: "Diamond" },
          { label: "MMR", value: 1234 },
        ]}
      />,
    );

    expect(screen.getByText("Rank")).toBeDefined();
    expect(screen.getByText("Diamond")).toBeDefined();
    expect(screen.getByText("MMR")).toBeDefined();
    expect(screen.getByText("1234")).toBeDefined();
  });
});
