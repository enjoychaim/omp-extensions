import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

const BASE_URL = "http://127.0.0.1:4000/v1";
const MODELS = [
  "gpt-image-2.5",
  "gpt-image-2.5-flare",
  "gpt-image-2.5-sunburst",
] as const;

type CatalogModel = Record<string, unknown> & {
  provider?: string;
  id?: string;
};

const PROVIDER = "litellm-images";
const MODEL_IDS: Record<(typeof MODELS)[number], true> = {
  "gpt-image-2.5": true,
  "gpt-image-2.5-flare": true,
  "gpt-image-2.5-sunburst": true,
};
const PATCHED = Symbol.for("omp.litellm-images.model-registry-patched");

function isTargetModel(model: CatalogModel): boolean {
  return (
    model.provider === PROVIDER &&
    typeof model.id === "string" &&
    MODEL_IDS[model.id as keyof typeof MODEL_IDS] === true
  );
}

function asImageModel(model: CatalogModel): CatalogModel {
  if (!isTargetModel(model)) return model;
  return {
    ...model,
    kind: "image",
    api: "openai-images",
    baseUrl: BASE_URL,
    input: ["text", "image"],
  };
}

function patchModelRegistry(pi: ExtensionAPI): void {
  const Registry = (pi.pi as Record<string, unknown>).ModelRegistry as {
    prototype: Record<PropertyKey, unknown>;
  };
  const prototype = Registry.prototype;
  if (prototype[PATCHED]) return;

  const getAll = prototype.getAll as (this: unknown, kind?: string) => CatalogModel[];
  const getAvailableForProviders = prototype.getAvailableForProviders as (
    this: unknown,
    providers: Set<string>,
    kind?: string,
  ) => CatalogModel[];
  const find = prototype.find as (this: unknown, ...args: unknown[]) => CatalogModel | undefined;
  const getProviderModels = prototype.getProviderModels as (
    this: unknown,
    provider: string,
  ) => CatalogModel[];

  prototype.getAll = function (this: unknown, kind = "chat") {
    if (kind === "all") return getAll.call(this, "all").map(asImageModel);
    const models = getAll.call(this, kind).filter((model) => !isTargetModel(model));
    if (kind !== "image") return models;
    const images = getAll.call(this, "all").filter(isTargetModel).map(asImageModel);
    return [...models, ...images];
  };

  prototype.getAvailableForProviders = function (
    this: unknown,
    providers: Set<string>,
    kind = "chat",
  ) {
    if (kind === "all") {
      return getAvailableForProviders.call(this, providers, "all").map(asImageModel);
    }
    const models = getAvailableForProviders
      .call(this, providers, kind)
      .filter((model) => !isTargetModel(model));
    if (kind !== "image") return models;
    const images = getAvailableForProviders
      .call(this, providers, "all")
      .filter(isTargetModel)
      .map(asImageModel);
    return [...models, ...images];
  };

  prototype.find = function (this: unknown, ...args: unknown[]) {
    const model = find.apply(this, args);
    return model ? asImageModel(model) : model;
  };

  prototype.getProviderModels = function (this: unknown, provider: string) {
    return getProviderModels.call(this, provider).map(asImageModel);
  };

  Object.defineProperty(prototype, PATCHED, { value: true });
}

export default function registerLiteLlmImages(pi: ExtensionAPI) {
  patchModelRegistry(pi);
  pi.registerProvider(
    PROVIDER,
    {
      baseUrl: BASE_URL,
      apiKey: "local",
      api: "openai-images",
      models: MODELS.map((id) => ({
        id,
        name: id,
        api: "openai-images",
        input: ["text", "image"],
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
        },
      })),
    } as never,
  );
}
