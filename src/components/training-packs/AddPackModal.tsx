import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { SelectWithLabel } from "@/components/ui/Select";
import type { SelectOption } from "@/components/ui/Select";
import type { PackCategory, PackDifficulty } from "@/lib/trainingPacksTypes";

const PACK_CATEGORIES: PackCategory[] = [
  "speedflip",
  "aerial",
  "dribbling",
  "shooting",
  "kickoff",
  "wall-ceiling",
  "goalie",
  "freestyle",
  "defense",
  "powershot",
];

const PACK_DIFFICULTIES: PackDifficulty[] = [
  "beginner",
  "intermediate",
  "advanced",
  "pro",
];

const CODE_REGEX = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i;

interface AddPackModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (pack: {
    name: string;
    code: string;
    creator: string;
    category: PackCategory;
    difficulty: PackDifficulty;
    description: string;
    tags: string[];
  }) => void;
}

export function AddPackModal({ open, onClose, onSave }: AddPackModalProps) {
  const { t } = useTranslation("trainingPacks");

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [creator, setCreator] = useState("");
  const [category, setCategory] = useState<PackCategory | "">("");
  const [difficulty, setDifficulty] = useState<PackDifficulty | "">("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (open) {
      setName("");
      setCode("");
      setCreator("");
      setCategory("");
      setDifficulty("");
      setDescription("");
      setTags("");
      setTouched({});
    }
  }, [open]);

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const categoryOptions: SelectOption[] = useMemo(
    () =>
      PACK_CATEGORIES.map((c) => ({
        value: c,
        label: t(`categories.${c}`),
      })),
    [t]
  );

  const difficultyOptions: SelectOption[] = useMemo(
    () =>
      PACK_DIFFICULTIES.map((d) => ({
        value: d,
        label: t(`difficulties.${d}`),
      })),
    [t]
  );

  const validation = useMemo(() => {
    const errors: {
      name?: string;
      code?: string;
      category?: string;
      difficulty?: string;
    } = {};

    if (!name.trim()) errors.name = t("page.requiredField");
    if (!code.trim()) {
      errors.code = t("page.requiredField");
    } else if (!CODE_REGEX.test(code.trim())) {
      errors.code = t("page.requiredField");
    }
    if (!category) errors.category = t("page.requiredField");
    if (!difficulty) errors.difficulty = t("page.requiredField");

    const isValid = Object.keys(errors).length === 0;
    return { errors, isValid };
  }, [name, code, category, difficulty, t]);

  const handleSave = () => {
    setTouched({
      name: true,
      code: true,
      category: true,
      difficulty: true,
      creator: true,
      description: true,
      tags: true,
    });

    if (!validation.isValid) return;

    onSave({
      name: name.trim(),
      code: code.trim().toUpperCase(),
      creator: creator.trim(),
      category: category as PackCategory,
      difficulty: difficulty as PackDifficulty,
      description: description.trim(),
      tags: tags
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    });

    onClose();
  };

  const inputBaseClass =
    "w-full border bg-bg-panel border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/50 outline-none transition-colors";

  const labelClass = "block text-sm font-medium text-text-primary mb-1";
  const errorClass = "text-xs text-accent-danger mt-1";

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={t("modal.addTitle")}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t("modal.cancel")}
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={!validation.isValid}
          >
            {t("modal.save")}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Name */}
        <div>
          <label htmlFor="pack-name" className={labelClass}>
            {t("page.name")}
          </label>
          <input
            id="pack-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => handleBlur("name")}
            placeholder={t("modal.namePlaceholder")}
            className={inputBaseClass}
          />
          {touched.name && validation.errors.name && (
            <p className={errorClass}>{validation.errors.name}</p>
          )}
        </div>

        {/* Code */}
        <div>
          <label htmlFor="pack-code" className={labelClass}>
            {t("page.codeLabel")}
          </label>
          <input
            id="pack-code"
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onBlur={() => handleBlur("code")}
            placeholder={t("modal.codePlaceholder")}
            className={inputBaseClass}
          />
          {touched.code && validation.errors.code && (
            <p className={errorClass}>{validation.errors.code}</p>
          )}
        </div>

        {/* Creator */}
        <div>
          <label htmlFor="pack-creator" className={labelClass}>
            {t("page.creatorLabel")}
          </label>
          <input
            id="pack-creator"
            type="text"
            value={creator}
            onChange={(e) => setCreator(e.target.value)}
            placeholder={t("modal.creatorPlaceholder")}
            className={inputBaseClass}
          />
        </div>

        {/* Category + Difficulty row */}
        <div className="grid grid-cols-2 gap-4 items-start">
          <div>
            <SelectWithLabel
              label={t("page.categoryLabel")}
              options={categoryOptions}
              value={category}
              onChange={(v) => {
                setCategory(v as PackCategory);
                handleBlur("category");
              }}
              placeholder={t("modal.categoryPlaceholder")}
            />
            {touched.category && validation.errors.category && (
              <p className={errorClass}>{validation.errors.category}</p>
            )}
          </div>

          <div>
            <SelectWithLabel
              label={t("page.difficultyLabel")}
              options={difficultyOptions}
              value={difficulty}
              onChange={(v) => {
                setDifficulty(v as PackDifficulty);
                handleBlur("difficulty");
              }}
              placeholder={t("modal.difficultyPlaceholder")}
            />
            {touched.difficulty && validation.errors.difficulty && (
              <p className={errorClass}>{validation.errors.difficulty}</p>
            )}
          </div>
        </div>

        {/* Description */}
        <div>
          <label htmlFor="pack-description" className={labelClass}>
            {t("page.descriptionLabel")}
          </label>
          <textarea
            id="pack-description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("modal.descriptionPlaceholder")}
            className={cn(inputBaseClass, "resize-none")}
          />
        </div>

        {/* Tags */}
        <div>
          <label htmlFor="pack-tags" className={labelClass}>
            Tags
          </label>
          <input
            id="pack-tags"
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder={t("modal.tagsPlaceholder")}
            className={inputBaseClass}
          />
        </div>
      </div>
    </Modal>
  );
}
