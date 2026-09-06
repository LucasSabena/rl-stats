// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { cleanup } from "@testing-library/react";
import { MoodPicker } from "./MoodPicker";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "es" } }),
}));

afterEach(() => cleanup());

describe("MoodPicker", () => {
  it("renders the five moods as radios", () => {
    render(<MoodPicker value={null} onChange={() => undefined} />);
    expect(screen.getAllByRole("radio")).toHaveLength(5);
    expect(screen.getByRole("radio", { name: "mood:options.very_happy" })).toBeDefined();
    expect(screen.getByRole("radio", { name: "mood:options.very_angry" })).toBeDefined();
  });

  it("emits the picked mood and marks it checked", () => {
    const onChange = vi.fn();
    const { rerender } = render(<MoodPicker value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "mood:options.happy" }));
    expect(onChange).toHaveBeenCalledWith("happy");

    rerender(<MoodPicker value="happy" onChange={onChange} />);
    expect(screen.getByRole("radio", { name: "mood:options.happy" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "mood:options.angry" }).getAttribute("aria-checked")).toBe("false");
  });

  it("disables every face when disabled", () => {
    render(<MoodPicker value={null} onChange={() => undefined} disabled />);
    for (const radio of screen.getAllByRole("radio")) {
      expect((radio as HTMLButtonElement).disabled).toBe(true);
    }
  });
});
