import { KeyboardEvent, useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  maxTags?: number;
  maxLength?: number;
}

export function TagInput({
  value,
  onChange,
  placeholder = "태그를 입력하고 Enter",
  maxTags = 20,
  maxLength = 30,
}: TagInputProps) {
  const [draft, setDraft] = useState("");

  const commitTag = () => {
    const tag = draft.trim();
    if (!tag) return;
    if (tag.length > maxLength) return;
    if (value.length >= maxTags) return;
    if (value.includes(tag)) return;
    onChange([...value, tag]);
    setDraft("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commitTag();
      return;
    }
    if (e.key === "Backspace" && !draft && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const removeTag = (tag: string) => onChange(value.filter((v) => v !== tag));

  return (
    <div className="space-y-2">
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitTag}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label="태그 입력"
      />
      <div className="flex flex-wrap gap-2">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-xs"
          >
            {tag}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-5 w-5 rounded-full"
              aria-label={`${tag} 태그 제거`}
              onClick={() => removeTag(tag)}
            >
              <X className="h-3 w-3" />
            </Button>
          </span>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {value.length}/{maxTags}개, 태그당 최대 {maxLength}자
      </p>
    </div>
  );
}
