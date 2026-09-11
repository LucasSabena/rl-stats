// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";
import { Button } from "./Button";
import { Input } from "./Input";
import { Modal } from "./Modal";
import { Switch } from "./Switch";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "es" } }),
}));

afterEach(() => cleanup());

// jsdom has no layout or paint: rules that need geometry cannot run.
const AXE_OPTIONS: axe.RunOptions = {
  rules: {
    "color-contrast": { enabled: false },
    "landmark-one-main": { enabled: false },
    region: { enabled: false },
    "page-has-heading-one": { enabled: false },
  },
};

async function expectNoA11yViolations(container: HTMLElement) {
  const results = await axe.run(container, AXE_OPTIONS);
  const summary = results.violations
    .map(
      (violation) =>
        `${violation.id} (${violation.impact ?? "unknown"}): ${violation.nodes
          .map((node) => node.html)
          .join(" | ")}`,
    )
    .join("\n");
  expect(results.violations, summary).toHaveLength(0);
}

describe("accessibility", () => {
  it("primitives expose names, roles and labels", async () => {
    const { container } = render(
      <div>
        <Button>Save</Button>
        <Button variant="icon" aria-label="Close">
          <span aria-hidden="true">x</span>
        </Button>
        <Input label="Player name" defaultValue="" />
        <Input aria-label="Search" placeholder="Search" defaultValue="" />
        <Switch
          checked
          onChange={() => {}}
          label="Autostart"
          description="Launch with Windows"
        />
        <Input
          label="Session gap"
          error="Required"
          hint="Minutes"
          defaultValue=""
        />
      </div>,
    );

    await expectNoA11yViolations(container);
  });

  it("the modal dialog is labelled and reachable", async () => {
    render(
      <Modal
        isOpen
        onClose={() => {}}
        title="Confirm"
        description="Are you sure?"
        footer={<Button>OK</Button>}
      >
        <p>Body</p>
      </Modal>,
    );

    await expectNoA11yViolations(document.body);
  });
});
