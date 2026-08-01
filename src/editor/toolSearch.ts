import { ALL_TOOLS, type Tool, type ToolGroup, type ToolId } from "./tools";

export const TOOL_GROUP_LABELS: Record<ToolGroup, string> = {
  select: "Select",
  tone: "Tone",
  privacy: "Privacy",
  retouch: "Retouch",
  mark: "Compose",
  color: "Sample",
  output: "Output",
};

const SEARCH_ALIASES: Partial<Record<ToolId, string>> = {
  tapfix: "smart contextual object fix",
  tod: "lighting grade dawn sunset night",
  relight: "depth light ai",
  hsl: "hsl colour selective",
  spot: "blemish repair clone",
  bgblur: "background portrait lens",
  bgrm: "background remove transparent cutout",
  mark: "logo copyright stamp",
  image: "overlay composite photo",
  color: "eyedropper sample pixel",
  idphoto: "passport visa country biometric print paper copies ID photo",
};

export function searchEditorTools(query: string, tools: readonly Tool[] = ALL_TOOLS): Tool[] {
  const tokens = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [...tools];

  return tools.filter((tool) => {
    const haystack =
      `${tool.name} ${TOOL_GROUP_LABELS[tool.group]} ${SEARCH_ALIASES[tool.id] ?? ""}`.toLocaleLowerCase();
    return tokens.every((token) => haystack.includes(token));
  });
}
