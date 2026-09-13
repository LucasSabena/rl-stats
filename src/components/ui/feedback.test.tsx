// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SegmentedControl } from "./SegmentedControl";
import { TagInput } from "./TagInput";
import { Sparkline } from "./Sparkline";
import { ProgressRing } from "./ProgressRing";
import { NumberTicker } from "./NumberTicker";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "es" } }),
}));

beforeEach(() => {
  // motion's useReducedMotion reads matchMedia, which jsdom doesn't implement.
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterEach(() => cleanup());

describe("SegmentedControl", () => {
  it("marks the active option and reports changes", () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        aria-label="Vista"
        value="a"
        onChange={onChange}
        options={[
          { value: "a", label: "A" },
          { value: "b", label: "B" },
        ]}
      />
    );

    expect(
      screen.getByRole("radio", { name: "A" }).getAttribute("aria-checked")
    ).toBe("true");
    expect(
      screen.getByRole("radio", { name: "B" }).getAttribute("aria-checked")
    ).toBe("false");

    fireEvent.click(screen.getByRole("radio", { name: "B" }));
    expect(onChange).toHaveBeenCalledWith("b");
  });
});

describe("TagInput", () => {
  it("commits tags with Enter and removes them", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <TagInput value={["smurf"]} onChange={onChange} aria-label="Tags" />
    );

    const input = screen.getByRole("textbox", { name: "Tags" });
    fireEvent.change(input, { target: { value: "tryhard" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(["smurf", "tryhard"]);

    rerender(<TagInput value={["smurf"]} onChange={onChange} aria-label="Tags" />);
    fireEvent.click(screen.getByRole("button", { name: "tagInput.remove" }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("ignores duplicate tags", () => {
    const onChange = vi.fn();
    render(<TagInput value={["duo"]} onChange={onChange} aria-label="Tags" />);
    const input = screen.getByRole("textbox", { name: "Tags" });
    fireEvent.change(input, { target: { value: "Duo" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("Sparkline", () => {
  it("renders an accessible polyline", () => {
    const { container } = render(
      <Sparkline values={[1, 4, 2, 8]} ariaLabel="Progreso" />
    );
    expect(screen.getByRole("img", { name: "Progreso" })).toBeTruthy();
    expect(container.querySelector("polyline")).toBeTruthy();
  });

  it("survives flat and empty series", () => {
    const { container: flat } = render(<Sparkline values={[3, 3, 3]} />);
    expect(flat.querySelector("polyline")).toBeTruthy();
    cleanup();
    const { container: empty } = render(<Sparkline values={[]} />);
    expect(empty.querySelector("polyline")).toBeTruthy();
  });
});

describe("ProgressRing", () => {
  it("clamps and labels progress", () => {
    render(<ProgressRing value={150} max={100} />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("100%");
  });
});

describe("NumberTicker", () => {
  it("renders the final value immediately under reduced motion", () => {
    render(<NumberTicker value={1234} />);
    expect(screen.getByText("1234")).toBeTruthy();
  });
});
