import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import type { UserPreset, UserPresetInput, CameraSettings, ControlSettings, DeadzoneSettings, HardwareSettings } from "@/lib/types";

interface UserPresetEditorProps {
  preset?: UserPreset | null;
  onSave: (input: UserPresetInput) => void;
  onCancel: () => void;
}

const defaultCamera: CameraSettings = {
  fov: 110,
  height: 100,
  angle: -3,
  distance: 270,
  stiffness: 0.5,
  swivelSpeed: 5,
  transitionSpeed: 1,
  ballCamera: "Toggle",
  cameraShake: "Off",
};

const defaultControls: ControlSettings = {
  powerslide: "L1",
  airRollLeft: "L1",
  airRollRight: "R1",
  boost: "Circle",
  jump: "Cross",
  ballCam: "Triangle",
  brake: "L2",
  throttle: "R2",
};

const defaultDeadzone: DeadzoneSettings = {
  deadzoneShape: "Cross",
  deadzone: 0.2,
  dodgeDeadzone: 0.5,
  aerialSensitivity: 1.0,
  steeringSensitivity: 1.0,
};

const defaultHardware: HardwareSettings = {
  controller: "DualShock 4",
  monitor: "24'' 144Hz",
  headset: "HyperX Cloud II",
};

export function UserPresetEditor({ preset, onSave, onCancel }: UserPresetEditorProps) {
  const { t } = useTranslation("presets");

  const [name, setName] = useState(preset?.name ?? "");
  const [description, setDescription] = useState(preset?.description ?? "");

  const [cameraEnabled, setCameraEnabled] = useState(!!preset?.camera);
  const [camera, setCamera] = useState<CameraSettings>(preset?.camera ?? defaultCamera);

  const [controlsEnabled, setControlsEnabled] = useState(!!preset?.controls);
  const [controls, setControls] = useState<ControlSettings>(preset?.controls ?? defaultControls);

  const [deadzoneEnabled, setDeadzoneEnabled] = useState(!!preset?.deadzone);
  const [deadzone, setDeadzone] = useState<DeadzoneSettings>(preset?.deadzone ?? defaultDeadzone);

  const [hardwareEnabled, setHardwareEnabled] = useState(!!preset?.hardware);
  const [hardware, setHardware] = useState<HardwareSettings>(preset?.hardware ?? defaultHardware);

  const handleSave = useCallback(() => {
    const input: UserPresetInput = {
      name,
      description: description || null,
      camera: cameraEnabled ? camera : null,
      controls: controlsEnabled ? controls : null,
      deadzone: deadzoneEnabled ? deadzone : null,
      hardware: hardwareEnabled ? hardware : null,
    };
    onSave(input);
  }, [name, description, cameraEnabled, camera, controlsEnabled, controls, deadzoneEnabled, deadzone, hardwareEnabled, hardware, onSave]);

  const SectionHeader = ({ label, enabled, onToggle }: { label: string; enabled: boolean; onToggle: (v: boolean) => void }) => (
    <div className="mb-3 flex items-center justify-between">
      <h4 className="text-sm font-semibold tracking-wide text-text-tertiary">{label}</h4>
      <label className="inline-flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="h-4 w-4 rounded border-border-subtle bg-bg-surface text-accent-primary focus:ring-accent-primary"
        />
        <span className="select-none text-xs text-text-secondary">{t("common:buttons.save")}</span>
      </label>
    </div>
  );

  const NumField = ({
    label,
    value,
    onChange,
    min,
    max,
    step,
  }: {
    label: string;
    value: number;
    onChange: (v: number) => void;
    min?: number;
    max?: number;
    step?: number;
  }) => (
    <div className="space-y-1">
      <label className="text-xs font-medium text-text-secondary">{label}</label>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-lg border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-accent-primary focus:ring-1 focus:ring-accent-primary"
      />
    </div>
  );

  const TextField = ({
    label,
    value,
    onChange,
  }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
  }) => (
    <div className="space-y-1">
      <label className="text-xs font-medium text-text-secondary">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-accent-primary focus:ring-1 focus:ring-accent-primary"
      />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <TextField label={t("name")} value={name} onChange={setName} />
        <div className="space-y-1">
          <label className="text-xs font-medium text-text-secondary">{t("description")}</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-lg border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-accent-primary focus:ring-1 focus:ring-accent-primary"
          />
        </div>
      </div>

      {/* Camera */}
      <fieldset className="rounded-xl border border-border-subtle p-4">
        <SectionHeader label={t("camera")} enabled={cameraEnabled} onToggle={setCameraEnabled} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <NumField label={t("fields:fov")} value={camera.fov} onChange={(v) => setCamera((c) => ({ ...c, fov: v }))} min={60} max={120} step={1} />
          <NumField label={t("fields:height")} value={camera.height} onChange={(v) => setCamera((c) => ({ ...c, height: v }))} min={0} max={200} step={1} />
          <NumField label={t("fields:angle")} value={camera.angle} onChange={(v) => setCamera((c) => ({ ...c, angle: v }))} min={-15} max={0} step={1} />
          <NumField label={t("fields:distance")} value={camera.distance} onChange={(v) => setCamera((c) => ({ ...c, distance: v }))} min={100} max={400} step={10} />
          <NumField label={t("fields:stiffness")} value={camera.stiffness} onChange={(v) => setCamera((c) => ({ ...c, stiffness: v }))} min={0} max={1} step={0.05} />
          <NumField label={t("fields:swivelSpeed")} value={camera.swivelSpeed} onChange={(v) => setCamera((c) => ({ ...c, swivelSpeed: v }))} min={1} max={10} step={0.1} />
          <NumField label={t("fields:transitionSpeed")} value={camera.transitionSpeed} onChange={(v) => setCamera((c) => ({ ...c, transitionSpeed: v }))} min={1} max={2} step={0.1} />
          <TextField label={t("fields:ballCamera")} value={camera.ballCamera} onChange={(v) => setCamera((c) => ({ ...c, ballCamera: v }))} />
          <TextField label={t("fields:cameraShake")} value={camera.cameraShake} onChange={(v) => setCamera((c) => ({ ...c, cameraShake: v }))} />
        </div>
      </fieldset>

      {/* Deadzone */}
      <fieldset className="rounded-xl border border-border-subtle p-4">
        <SectionHeader label={t("deadzone")} enabled={deadzoneEnabled} onToggle={setDeadzoneEnabled} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <TextField label={t("fields:deadzoneShape")} value={deadzone.deadzoneShape} onChange={(v) => setDeadzone((d) => ({ ...d, deadzoneShape: v }))} />
          <NumField label={t("fields:deadzone")} value={deadzone.deadzone} onChange={(v) => setDeadzone((d) => ({ ...d, deadzone: v }))} min={0} max={1} step={0.01} />
          <NumField label={t("fields:dodgeDeadzone")} value={deadzone.dodgeDeadzone} onChange={(v) => setDeadzone((d) => ({ ...d, dodgeDeadzone: v }))} min={0} max={1} step={0.01} />
          <NumField label={t("fields:aerialSensitivity")} value={deadzone.aerialSensitivity} onChange={(v) => setDeadzone((d) => ({ ...d, aerialSensitivity: v }))} min={0.5} max={2} step={0.1} />
          <NumField label={t("fields:steeringSensitivity")} value={deadzone.steeringSensitivity} onChange={(v) => setDeadzone((d) => ({ ...d, steeringSensitivity: v }))} min={0.5} max={2} step={0.1} />
        </div>
      </fieldset>

      {/* Controls */}
      <fieldset className="rounded-xl border border-border-subtle p-4">
        <SectionHeader label={t("controls")} enabled={controlsEnabled} onToggle={setControlsEnabled} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <TextField label={t("fields:powerslide")} value={controls.powerslide} onChange={(v) => setControls((c) => ({ ...c, powerslide: v }))} />
          <TextField label={t("fields:airRollLeft")} value={controls.airRollLeft} onChange={(v) => setControls((c) => ({ ...c, airRollLeft: v }))} />
          <TextField label={t("fields:airRollRight")} value={controls.airRollRight} onChange={(v) => setControls((c) => ({ ...c, airRollRight: v }))} />
          <TextField label={t("fields:boost")} value={controls.boost} onChange={(v) => setControls((c) => ({ ...c, boost: v }))} />
          <TextField label={t("fields:jump")} value={controls.jump} onChange={(v) => setControls((c) => ({ ...c, jump: v }))} />
          <TextField label={t("fields:ballCam")} value={controls.ballCam} onChange={(v) => setControls((c) => ({ ...c, ballCam: v }))} />
          <TextField label={t("fields:brake")} value={controls.brake} onChange={(v) => setControls((c) => ({ ...c, brake: v }))} />
          <TextField label={t("fields:throttle")} value={controls.throttle} onChange={(v) => setControls((c) => ({ ...c, throttle: v }))} />
        </div>
      </fieldset>

      {/* Hardware */}
      <fieldset className="rounded-xl border border-border-subtle p-4">
        <SectionHeader label={t("hardware")} enabled={hardwareEnabled} onToggle={setHardwareEnabled} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <TextField label={t("fields:controller")} value={hardware.controller} onChange={(v) => setHardware((h) => ({ ...h, controller: v }))} />
          <TextField label={t("fields:monitor")} value={hardware.monitor} onChange={(v) => setHardware((h) => ({ ...h, monitor: v }))} />
          <TextField label={t("fields:headset")} value={hardware.headset} onChange={(v) => setHardware((h) => ({ ...h, headset: v }))} />
        </div>
      </fieldset>

      <div className="flex items-center justify-end gap-3">
        <Button variant="ghost" onClick={onCancel}>
          {t("cancel")}
        </Button>
        <Button variant="primary" onClick={handleSave} disabled={!name.trim()}>
          {t("save")}
        </Button>
      </div>
    </div>
  );
}
