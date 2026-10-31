import { createElement } from "react";
import { ModelIcon } from "./icons";
import { MODEL_BRAND_MARKS } from "./model-brand-marks";
import { modelFamily } from "./model-families";

export function ModelBrandIcon({
  provider,
  modelId,
}: {
  readonly provider?: string;
  readonly modelId?: string;
}) {
  const family = modelFamily(provider, modelId);
  const icon = family ? MODEL_BRAND_MARKS[family.id] : undefined;
  if (!icon) return <ModelIcon />;
  return (
    <svg {...icon.attributes} aria-hidden="true">
      {icon.parts.map((part, key) => createElement(part.tag, { ...part.attributes, key }))}
    </svg>
  );
}
