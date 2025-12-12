var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __toESM = (mod, isNodeMode, target) => {
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: () => mod[key],
        enumerable: true
      });
  return to;
};
var __moduleCache = /* @__PURE__ */ new WeakMap;
var __toCommonJS = (from) => {
  var entry = __moduleCache.get(from), desc;
  if (entry)
    return entry;
  entry = __defProp({}, "__esModule", { value: true });
  if (from && typeof from === "object" || typeof from === "function")
    __getOwnPropNames(from).map((key) => !__hasOwnProp.call(entry, key) && __defProp(entry, key, {
      get: () => from[key],
      enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
    }));
  __moduleCache.set(from, entry);
  return entry;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: (newValue) => all[name] = () => newValue
    });
};

// src/index.node.ts
var exports_index_node = {};
__export(exports_index_node, {
  worldTable: () => worldTable,
  taskTable: () => taskTable,
  serverTable: () => serverTable,
  serverAgentsTable: () => serverAgentsTable,
  roomTable: () => roomTable,
  relationshipTable: () => relationshipTable,
  pluginSql: () => import_node3.default,
  participantTable: () => participantTable,
  messageTable: () => messageTable,
  messageServerTable: () => messageServerTable,
  messageServerAgentsTable: () => messageServerAgentsTable,
  memoryTable: () => memoryTable,
  logTable: () => logTable,
  getCloudStorage: () => getCloudStorage,
  entityTable: () => entityTable,
  embeddingTable: () => embeddingTable,
  elizaOSCloudPlugin: () => elizaOSCloudPlugin,
  default: () => src_default,
  createDirectDatabaseAdapter: () => createDirectDatabaseAdapter,
  createDatabaseAdapter: () => createDatabaseAdapter,
  createCloudStorageService: () => createCloudStorageService,
  createCloudDatabaseAdapter: () => createCloudDatabaseAdapter,
  componentTable: () => componentTable,
  channelTable: () => channelTable,
  channelParticipantsTable: () => channelParticipantsTable,
  cacheTable: () => cacheTable,
  agentTable: () => agentTable,
  CloudStorageService: () => CloudStorageService,
  CloudDatabaseAdapter: () => CloudDatabaseAdapter
});
module.exports = __toCommonJS(exports_index_node);

// src/index.ts
var import_core15 = require("@elizaos/core");

// src/init.ts
var import_core2 = require("@elizaos/core");

// src/utils/config.ts
var import_core = require("@elizaos/core");
function getSetting(runtime, key, defaultValue) {
  return runtime.getSetting(key) ?? process.env[key] ?? defaultValue;
}
function isBrowser() {
  return typeof globalThis !== "undefined" && typeof globalThis.document !== "undefined";
}
function isProxyMode(runtime) {
  return isBrowser() && !!getSetting(runtime, "ELIZAOS_CLOUD_BROWSER_BASE_URL");
}
function getAuthHeader(runtime, forEmbedding = false) {
  if (isBrowser())
    return {};
  const key = forEmbedding ? getEmbeddingApiKey(runtime) : getApiKey(runtime);
  return key ? { Authorization: `Bearer ${key}` } : {};
}
function getBaseURL(runtime) {
  const browserURL = getSetting(runtime, "ELIZAOS_CLOUD_BROWSER_BASE_URL");
  const baseURL = isBrowser() && browserURL ? browserURL : getSetting(runtime, "ELIZAOS_CLOUD_BASE_URL", "https://www.elizacloud.ai/api/v1");
  console.log(`[ELIZAOS_CLOUD] Default base URL: ${baseURL}`);
  return baseURL;
}
function getEmbeddingBaseURL(runtime) {
  const embeddingURL = isBrowser() ? getSetting(runtime, "ELIZAOS_CLOUD_BROWSER_EMBEDDING_URL") || getSetting(runtime, "ELIZAOS_CLOUD_BROWSER_BASE_URL") : getSetting(runtime, "ELIZAOS_CLOUD_EMBEDDING_URL");
  if (embeddingURL) {
    import_core.logger.debug(`[ELIZAOS_CLOUD] Using specific embedding base URL: ${embeddingURL}`);
    return embeddingURL;
  }
  import_core.logger.debug("[ELIZAOS_CLOUD] Falling back to general base URL for embeddings.");
  return getBaseURL(runtime);
}
function getApiKey(runtime) {
  return getSetting(runtime, "ELIZAOS_CLOUD_API_KEY");
}
function getEmbeddingApiKey(runtime) {
  const embeddingApiKey = getSetting(runtime, "ELIZAOS_CLOUD_EMBEDDING_API_KEY");
  if (embeddingApiKey) {
    import_core.logger.debug("[ELIZAOS_CLOUD] Using specific embedding API key (present)");
    return embeddingApiKey;
  }
  import_core.logger.debug("[ELIZAOS_CLOUD] Falling back to general API key for embeddings.");
  return getApiKey(runtime);
}
function getSmallModel(runtime) {
  return getSetting(runtime, "ELIZAOS_CLOUD_SMALL_MODEL") ?? getSetting(runtime, "SMALL_MODEL", "gpt-4o-mini");
}
function getLargeModel(runtime) {
  return getSetting(runtime, "ELIZAOS_CLOUD_LARGE_MODEL") ?? getSetting(runtime, "LARGE_MODEL", "gpt-4o");
}
function getImageDescriptionModel(runtime) {
  return getSetting(runtime, "ELIZAOS_CLOUD_IMAGE_DESCRIPTION_MODEL", "gpt-4o-mini") ?? "gpt-4o-mini";
}
function getImageGenerationModel(runtime) {
  return getSetting(runtime, "ELIZAOS_CLOUD_IMAGE_GENERATION_MODEL", "openai/gpt-5-nano") ?? "openai/gpt-5-nano";
}
function getExperimentalTelemetry(runtime) {
  const setting = getSetting(runtime, "ELIZAOS_CLOUD_EXPERIMENTAL_TELEMETRY", "false");
  const normalizedSetting = String(setting).toLowerCase();
  const result = normalizedSetting === "true";
  import_core.logger.debug(`[ELIZAOS_CLOUD] Experimental telemetry in function: "${setting}" (type: ${typeof setting}, normalized: "${normalizedSetting}", result: ${result})`);
  return result;
}

// src/init.ts
function initializeOpenAI(_config, runtime) {
  new Promise(async (resolve) => {
    resolve();
    try {
      if (!getApiKey(runtime) && !isBrowser()) {
        import_core2.logger.warn("ELIZAOS_CLOUD_API_KEY is not set in environment - ElizaOS Cloud functionality will be limited");
        import_core2.logger.info("Get your API key from https://www.elizacloud.ai/dashboard/api-keys");
        return;
      }
      try {
        const baseURL = getBaseURL(runtime);
        const response = await fetch(`${baseURL}/models`, {
          headers: { ...getAuthHeader(runtime) }
        });
        if (!response.ok) {
          import_core2.logger.warn(`ElizaOS Cloud API key validation failed: ${response.statusText}`);
          import_core2.logger.warn("ElizaOS Cloud functionality will be limited until a valid API key is provided");
          import_core2.logger.info("Get your API key from https://www.elizacloud.ai/dashboard/api-keys");
        } else {
          import_core2.logger.log("ElizaOS Cloud API key validated successfully");
        }
      } catch (fetchError) {
        const message = fetchError instanceof Error ? fetchError.message : String(fetchError);
        import_core2.logger.warn(`Error validating ElizaOS Cloud API key: ${message}`);
        import_core2.logger.warn("ElizaOS Cloud functionality will be limited until a valid API key is provided");
      }
    } catch (error) {
      const message = error?.errors?.map((e) => e.message).join(", ") || (error instanceof Error ? error.message : String(error));
      import_core2.logger.warn(`ElizaOS Cloud plugin configuration issue: ${message} - You need to configure the ELIZAOS_CLOUD_API_KEY in your environment variables`);
      import_core2.logger.info("Get your API key from https://www.elizacloud.ai/dashboard/api-keys");
    }
  });
}

// src/models/text.ts
var import_core4 = require("@elizaos/core");
var import_ai = require("ai");

// src/providers/openai.ts
var import_openai = require("@ai-sdk/openai");
function createOpenAIClient(runtime) {
  const baseURL = getBaseURL(runtime);
  const apiKey = getApiKey(runtime) ?? (isProxyMode(runtime) ? "eliza-proxy" : undefined);
  return import_openai.createOpenAI({ apiKey: apiKey ?? "", baseURL });
}

// src/utils/events.ts
var import_core3 = require("@elizaos/core");
function emitModelUsageEvent(runtime, type, prompt, usage) {
  runtime.emitEvent(import_core3.EventType.MODEL_USED, {
    provider: "openai",
    type,
    prompt,
    tokens: {
      prompt: usage.inputTokens,
      completion: usage.outputTokens,
      total: usage.totalTokens
    }
  });
}

// src/models/text.ts
async function handleTextSmall(runtime, {
  prompt,
  stopSequences = [],
  maxTokens = 8192,
  temperature = 0.7,
  frequencyPenalty = 0.7,
  presencePenalty = 0.7
}) {
  const openai = createOpenAIClient(runtime);
  const modelName = getSmallModel(runtime);
  const experimentalTelemetry = getExperimentalTelemetry(runtime);
  import_core4.logger.log(`[ELIZAOS_CLOUD] Using TEXT_SMALL model: ${modelName}`);
  import_core4.logger.log(prompt);
  const { text: openaiResponse, usage } = await import_ai.generateText({
    model: openai.languageModel(modelName),
    prompt,
    system: runtime.character.system ?? undefined,
    temperature,
    maxOutputTokens: maxTokens,
    frequencyPenalty,
    presencePenalty,
    stopSequences,
    experimental_telemetry: {
      isEnabled: experimentalTelemetry
    }
  });
  if (usage) {
    emitModelUsageEvent(runtime, import_core4.ModelType.TEXT_SMALL, prompt, usage);
  }
  return openaiResponse;
}
async function handleTextLarge(runtime, {
  prompt,
  stopSequences = [],
  maxTokens = 8192,
  temperature = 0.7,
  frequencyPenalty = 0.7,
  presencePenalty = 0.7
}) {
  const openai = createOpenAIClient(runtime);
  const modelName = getLargeModel(runtime);
  const experimentalTelemetry = getExperimentalTelemetry(runtime);
  import_core4.logger.log(`[ELIZAOS_CLOUD] Using TEXT_LARGE model: ${modelName}`);
  import_core4.logger.log(prompt);
  const { text: openaiResponse, usage } = await import_ai.generateText({
    model: openai.languageModel(modelName),
    prompt,
    system: runtime.character.system ?? undefined,
    temperature,
    maxOutputTokens: maxTokens,
    frequencyPenalty,
    presencePenalty,
    stopSequences,
    experimental_telemetry: {
      isEnabled: experimentalTelemetry
    }
  });
  if (usage) {
    emitModelUsageEvent(runtime, import_core4.ModelType.TEXT_LARGE, prompt, usage);
  }
  return openaiResponse;
}
// src/models/object.ts
var import_core6 = require("@elizaos/core");
var import_ai3 = require("ai");

// src/utils/helpers.ts
var import_core5 = require("@elizaos/core");
var import_ai2 = require("ai");
function getJsonRepairFunction() {
  return async ({ text, error }) => {
    try {
      if (error instanceof import_ai2.JSONParseError) {
        const cleanedText = text.replace(/```json\n|\n```|```/g, "");
        JSON.parse(cleanedText);
        return cleanedText;
      }
      return null;
    } catch (jsonError) {
      const message = jsonError instanceof Error ? jsonError.message : String(jsonError);
      import_core5.logger.warn(`Failed to repair JSON text: ${message}`);
      return null;
    }
  };
}
function detectAudioMimeType(buffer) {
  if (buffer.length < 12) {
    return "application/octet-stream";
  }
  if (buffer[0] === 82 && buffer[1] === 73 && buffer[2] === 70 && buffer[3] === 70 && buffer[8] === 87 && buffer[9] === 65 && buffer[10] === 86 && buffer[11] === 69) {
    return "audio/wav";
  }
  if (buffer[0] === 73 && buffer[1] === 68 && buffer[2] === 51 || buffer[0] === 255 && (buffer[1] & 224) === 224) {
    return "audio/mpeg";
  }
  if (buffer[0] === 79 && buffer[1] === 103 && buffer[2] === 103 && buffer[3] === 83) {
    return "audio/ogg";
  }
  if (buffer[0] === 102 && buffer[1] === 76 && buffer[2] === 97 && buffer[3] === 67) {
    return "audio/flac";
  }
  if (buffer[4] === 102 && buffer[5] === 116 && buffer[6] === 121 && buffer[7] === 112) {
    return "audio/mp4";
  }
  if (buffer[0] === 26 && buffer[1] === 69 && buffer[2] === 223 && buffer[3] === 163) {
    return "audio/webm";
  }
  import_core5.logger.warn("Could not detect audio format from buffer, using generic binary type");
  return "application/octet-stream";
}
async function webStreamToNodeStream(webStream) {
  try {
    const { Readable } = await import("node:stream");
    const reader = webStream.getReader();
    return new Readable({
      async read() {
        try {
          const { done, value } = await reader.read();
          if (done) {
            this.push(null);
          } else {
            this.push(value);
          }
        } catch (error) {
          this.destroy(error);
        }
      },
      destroy(error, callback) {
        reader.cancel().finally(() => callback(error));
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    import_core5.logger.error(`Failed to load node:stream module: ${message}`);
    throw new Error(`Cannot convert stream: node:stream module unavailable. This feature requires a Node.js environment.`);
  }
}
function parseImageDescriptionResponse(responseText) {
  const titleMatch = responseText.match(/title[:\s]+(.+?)(?:\n|$)/i);
  const title = titleMatch?.[1]?.trim() || "Image Analysis";
  const description = responseText.replace(/title[:\s]+(.+?)(?:\n|$)/i, "").trim();
  return { title, description };
}

// src/models/object.ts
async function generateObjectByModelType(runtime, params, modelType, getModelFn) {
  const openai = createOpenAIClient(runtime);
  const modelName = getModelFn(runtime);
  import_core6.logger.log(`[ELIZAOS_CLOUD] Using ${modelType} model: ${modelName}`);
  const temperature = params.temperature ?? 0;
  const schemaPresent = !!params.schema;
  if (schemaPresent) {
    import_core6.logger.info(`Using ${modelType} without schema validation (schema provided but output=no-schema)`);
  }
  try {
    const { object, usage } = await import_ai3.generateObject({
      model: openai.languageModel(modelName),
      output: "no-schema",
      prompt: params.prompt,
      temperature,
      experimental_repairText: getJsonRepairFunction()
    });
    if (usage) {
      emitModelUsageEvent(runtime, modelType, params.prompt, usage);
    }
    return object;
  } catch (error) {
    if (error instanceof import_ai3.JSONParseError) {
      import_core6.logger.error(`[generateObject] Failed to parse JSON: ${error.message}`);
      const repairFunction = getJsonRepairFunction();
      const repairedJsonString = await repairFunction({
        text: error.text,
        error
      });
      if (repairedJsonString) {
        try {
          const repairedObject = JSON.parse(repairedJsonString);
          import_core6.logger.info("[generateObject] Successfully repaired JSON.");
          return repairedObject;
        } catch (repairParseError) {
          const message = repairParseError instanceof Error ? repairParseError.message : String(repairParseError);
          import_core6.logger.error(`[generateObject] Failed to parse repaired JSON: ${message}`);
          throw repairParseError;
        }
      } else {
        import_core6.logger.error("[generateObject] JSON repair failed.");
        throw error;
      }
    } else {
      const message = error instanceof Error ? error.message : String(error);
      import_core6.logger.error(`[generateObject] Unknown error: ${message}`);
      throw error;
    }
  }
}
async function handleObjectSmall(runtime, params) {
  return generateObjectByModelType(runtime, params, import_core6.ModelType.OBJECT_SMALL, getSmallModel);
}
async function handleObjectLarge(runtime, params) {
  return generateObjectByModelType(runtime, params, import_core6.ModelType.OBJECT_LARGE, getLargeModel);
}
// src/models/embeddings.ts
var import_core7 = require("@elizaos/core");
async function handleTextEmbedding(runtime, params) {
  const embeddingModelName = getSetting(runtime, "ELIZAOS_CLOUD_EMBEDDING_MODEL", "text-embedding-3-small");
  const embeddingDimension = Number.parseInt(getSetting(runtime, "ELIZAOS_CLOUD_EMBEDDING_DIMENSIONS", "1536") || "1536", 10);
  if (!Object.values(import_core7.VECTOR_DIMS).includes(embeddingDimension)) {
    const errorMsg = `Invalid embedding dimension: ${embeddingDimension}. Must be one of: ${Object.values(import_core7.VECTOR_DIMS).join(", ")}`;
    import_core7.logger.error(errorMsg);
    throw new Error(errorMsg);
  }
  if (params === null) {
    import_core7.logger.debug("Creating test embedding for initialization");
    const testVector = Array(embeddingDimension).fill(0);
    testVector[0] = 0.1;
    return testVector;
  }
  let text;
  if (typeof params === "string") {
    text = params;
  } else if (typeof params === "object" && params.text) {
    text = params.text;
  } else {
    import_core7.logger.warn("Invalid input format for embedding");
    const fallbackVector = Array(embeddingDimension).fill(0);
    fallbackVector[0] = 0.2;
    return fallbackVector;
  }
  if (!text.trim()) {
    import_core7.logger.warn("Empty text for embedding");
    const emptyVector = Array(embeddingDimension).fill(0);
    emptyVector[0] = 0.3;
    return emptyVector;
  }
  const embeddingBaseURL = getEmbeddingBaseURL(runtime);
  try {
    const response = await fetch(`${embeddingBaseURL}/embeddings`, {
      method: "POST",
      headers: {
        ...getAuthHeader(runtime, true),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: embeddingModelName,
        input: text
      })
    });
    if (!response.ok) {
      import_core7.logger.error(`ElizaOS Cloud API error: ${response.status} - ${response.statusText}`);
      const errorVector = Array(embeddingDimension).fill(0);
      errorVector[0] = 0.4;
      return errorVector;
    }
    const data = await response.json();
    if (!data?.data?.[0]?.embedding) {
      import_core7.logger.error("API returned invalid structure");
      const errorVector = Array(embeddingDimension).fill(0);
      errorVector[0] = 0.5;
      return errorVector;
    }
    const embedding = data.data[0].embedding;
    if (data.usage) {
      const usage = {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: 0,
        totalTokens: data.usage.total_tokens
      };
      emitModelUsageEvent(runtime, import_core7.ModelType.TEXT_EMBEDDING, text, usage);
    }
    import_core7.logger.log(`Got valid embedding with length ${embedding.length}`);
    return embedding;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    import_core7.logger.error(`Error generating embedding: ${message}`);
    const errorVector = Array(embeddingDimension).fill(0);
    errorVector[0] = 0.6;
    return errorVector;
  }
}
// src/models/image.ts
var import_core8 = require("@elizaos/core");
async function handleImageGeneration(runtime, params) {
  const numImages = params.n || 1;
  const size = params.size || "1024x1024";
  const prompt = params.prompt;
  const modelName = getImageGenerationModel(runtime);
  import_core8.logger.log(`[ELIZAOS_CLOUD] Using IMAGE model: ${modelName}`);
  const baseURL = getBaseURL(runtime);
  const aspectRatioMap = {
    "1024x1024": "1:1",
    "1792x1024": "16:9",
    "1024x1792": "9:16"
  };
  const aspectRatio = aspectRatioMap[size] || "1:1";
  try {
    const response = await fetch(`${baseURL}/generate-image`, {
      method: "POST",
      headers: {
        ...getAuthHeader(runtime),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt,
        numImages,
        aspectRatio
      })
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to generate image: ${response.status} ${errorText}`);
    }
    const data = await response.json();
    const typedData = data;
    return typedData.images.map((img) => ({
      url: img.url || img.image
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    import_core8.logger.error(`[ELIZAOS_CLOUD] Image generation error: ${message}`);
    throw error;
  }
}
async function handleImageDescription(runtime, params) {
  let imageUrl;
  let promptText;
  const modelName = getImageDescriptionModel(runtime);
  import_core8.logger.log(`[ELIZAOS_CLOUD] Using IMAGE_DESCRIPTION model: ${modelName}`);
  const maxTokens = Number.parseInt(getSetting(runtime, "ELIZAOS_CLOUD_IMAGE_DESCRIPTION_MAX_TOKENS", "8192") || "8192", 10);
  if (typeof params === "string") {
    imageUrl = params;
    promptText = "Please analyze this image and provide a title and detailed description.";
  } else {
    imageUrl = params.imageUrl;
    promptText = params.prompt || "Please analyze this image and provide a title and detailed description.";
  }
  const messages = [
    {
      role: "user",
      content: [
        { type: "text", text: promptText },
        { type: "image_url", image_url: { url: imageUrl } }
      ]
    }
  ];
  const baseURL = getBaseURL(runtime);
  try {
    const requestBody = {
      model: modelName,
      messages,
      max_tokens: maxTokens
    };
    const response = await fetch(`${baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(runtime)
      },
      body: JSON.stringify(requestBody)
    });
    if (!response.ok) {
      throw new Error(`ElizaOS Cloud API error: ${response.status}`);
    }
    const result = await response.json();
    const typedResult = result;
    const content = typedResult.choices?.[0]?.message?.content;
    if (typedResult.usage) {
      emitModelUsageEvent(runtime, import_core8.ModelType.IMAGE_DESCRIPTION, typeof params === "string" ? params : params.prompt || "", {
        inputTokens: typedResult.usage.prompt_tokens,
        outputTokens: typedResult.usage.completion_tokens,
        totalTokens: typedResult.usage.total_tokens
      });
    }
    if (!content) {
      return {
        title: "Failed to analyze image",
        description: "No response from API"
      };
    }
    const isCustomPrompt = typeof params === "object" && params.prompt && params.prompt !== "Please analyze this image and provide a title and detailed description.";
    if (isCustomPrompt) {
      return content;
    }
    const processedResult = parseImageDescriptionResponse(content);
    return processedResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    import_core8.logger.error(`Error analyzing image: ${message}`);
    return {
      title: "Failed to analyze image",
      description: `Error: ${message}`
    };
  }
}
// src/models/transcription.ts
var import_core9 = require("@elizaos/core");
async function handleTranscription(runtime, input) {
  let modelName = getSetting(runtime, "ELIZAOS_CLOUD_TRANSCRIPTION_MODEL", "gpt-4o-mini-transcribe");
  import_core9.logger.log(`[ELIZAOS_CLOUD] Using TRANSCRIPTION model: ${modelName}`);
  const baseURL = getBaseURL(runtime);
  let blob;
  let extraParams = null;
  if (input instanceof Blob || input instanceof File) {
    blob = input;
  } else if (Buffer.isBuffer(input)) {
    const detectedMimeType = detectAudioMimeType(input);
    import_core9.logger.debug(`Auto-detected audio MIME type: ${detectedMimeType}`);
    blob = new Blob([input], { type: detectedMimeType });
  } else if (typeof input === "object" && input !== null && "audio" in input && input.audio != null) {
    const params = input;
    if (!(params.audio instanceof Blob) && !(params.audio instanceof File) && !Buffer.isBuffer(params.audio)) {
      throw new Error("TRANSCRIPTION param 'audio' must be a Blob/File/Buffer.");
    }
    if (Buffer.isBuffer(params.audio)) {
      let mimeType = params.mimeType;
      if (!mimeType) {
        mimeType = detectAudioMimeType(params.audio);
        import_core9.logger.debug(`Auto-detected audio MIME type: ${mimeType}`);
      } else {
        import_core9.logger.debug(`Using provided MIME type: ${mimeType}`);
      }
      blob = new Blob([params.audio], { type: mimeType });
    } else {
      blob = params.audio;
    }
    extraParams = params;
    if (typeof params.model === "string" && params.model) {
      modelName = params.model;
    }
  } else {
    throw new Error("TRANSCRIPTION expects a Blob/File/Buffer or an object { audio: Blob/File/Buffer, mimeType?, language?, response_format?, timestampGranularities?, prompt?, temperature?, model? }");
  }
  const mime = blob.type || "audio/webm";
  const filename = blob.name || (mime.includes("mp3") || mime.includes("mpeg") ? "recording.mp3" : mime.includes("ogg") ? "recording.ogg" : mime.includes("wav") ? "recording.wav" : mime.includes("webm") ? "recording.webm" : "recording.bin");
  const formData = new FormData;
  formData.append("file", blob, filename);
  formData.append("model", String(modelName));
  if (extraParams) {
    if (typeof extraParams.language === "string") {
      formData.append("language", String(extraParams.language));
    }
    if (typeof extraParams.response_format === "string") {
      formData.append("response_format", String(extraParams.response_format));
    }
    if (typeof extraParams.prompt === "string") {
      formData.append("prompt", String(extraParams.prompt));
    }
    if (typeof extraParams.temperature === "number") {
      formData.append("temperature", String(extraParams.temperature));
    }
    if (Array.isArray(extraParams.timestampGranularities)) {
      for (const g of extraParams.timestampGranularities) {
        formData.append("timestamp_granularities[]", String(g));
      }
    }
  }
  try {
    const response = await fetch(`${baseURL}/audio/transcriptions`, {
      method: "POST",
      headers: {
        ...getAuthHeader(runtime)
      },
      body: formData
    });
    if (!response.ok) {
      throw new Error(`Failed to transcribe audio: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    return data.text || "";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    import_core9.logger.error(`TRANSCRIPTION error: ${message}`);
    throw error;
  }
}
// src/models/speech.ts
var import_core10 = require("@elizaos/core");
async function fetchTextToSpeech(runtime, options) {
  const defaultModel = getSetting(runtime, "ELIZAOS_CLOUD_TTS_MODEL", "gpt-4o-mini-tts");
  const defaultVoice = getSetting(runtime, "ELIZAOS_CLOUD_TTS_VOICE", "nova");
  const defaultInstructions = getSetting(runtime, "ELIZAOS_CLOUD_TTS_INSTRUCTIONS", "");
  const baseURL = getBaseURL(runtime);
  const model = options.model || defaultModel;
  const voice = options.voice || defaultVoice;
  const instructions = options.instructions ?? defaultInstructions;
  const format = options.format || "mp3";
  try {
    const res = await fetch(`${baseURL}/audio/speech`, {
      method: "POST",
      headers: {
        ...getAuthHeader(runtime),
        "Content-Type": "application/json",
        ...format === "mp3" ? { Accept: "audio/mpeg" } : {}
      },
      body: JSON.stringify({
        model,
        voice,
        input: options.text,
        format,
        ...instructions && { instructions }
      })
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`ElizaOS Cloud TTS error ${res.status}: ${err}`);
    }
    if (!res.body) {
      throw new Error("ElizaOS Cloud TTS response body is null");
    }
    if (!isBrowser()) {
      return await webStreamToNodeStream(res.body);
    }
    return res.body;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to fetch speech from ElizaOS Cloud TTS: ${message}`);
  }
}
async function handleTextToSpeech(runtime, input) {
  const options = typeof input === "string" ? { text: input } : input;
  const resolvedModel = options.model || getSetting(runtime, "ELIZAOS_CLOUD_TTS_MODEL", "gpt-4o-mini-tts");
  import_core10.logger.log(`[ELIZAOS_CLOUD] Using TEXT_TO_SPEECH model: ${resolvedModel}`);
  try {
    const speechStream = await fetchTextToSpeech(runtime, options);
    return speechStream;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    import_core10.logger.error(`Error in TEXT_TO_SPEECH: ${message}`);
    throw error;
  }
}
// src/models/tokenization.ts
var import_core11 = require("@elizaos/core");
var import_js_tiktoken = require("js-tiktoken");
async function tokenizeText(model, prompt) {
  const modelName = model === import_core11.ModelType.TEXT_SMALL ? process.env.ELIZAOS_CLOUD_SMALL_MODEL ?? process.env.SMALL_MODEL ?? "gpt-5-nano" : process.env.LARGE_MODEL ?? "gpt-5-mini";
  const tokens = import_js_tiktoken.encodingForModel(modelName).encode(prompt);
  return tokens;
}
async function detokenizeText(model, tokens) {
  const modelName = model === import_core11.ModelType.TEXT_SMALL ? process.env.ELIZAOS_CLOUD_SMALL_MODEL ?? process.env.SMALL_MODEL ?? "gpt-5-nano" : process.env.ELIZAOS_CLOUD_LARGE_MODEL ?? process.env.LARGE_MODEL ?? "gpt-5-mini";
  return import_js_tiktoken.encodingForModel(modelName).decode(tokens);
}
async function handleTokenizerEncode(_runtime, { prompt, modelType = import_core11.ModelType.TEXT_LARGE }) {
  return await tokenizeText(modelType ?? import_core11.ModelType.TEXT_LARGE, prompt);
}
async function handleTokenizerDecode(_runtime, { tokens, modelType = import_core11.ModelType.TEXT_LARGE }) {
  return await detokenizeText(modelType ?? import_core11.ModelType.TEXT_LARGE, tokens);
}
// src/database/adapter.ts
var import_core12 = require("@elizaos/core");
var import_node = __toESM(require("@elizaos/plugin-sql/node"));
var DEFAULT_CLOUD_URL = "https://www.elizacloud.ai";
async function createCloudDatabaseAdapter(config) {
  const baseUrl = config.baseUrl || DEFAULT_CLOUD_URL;
  import_core12.logger.info({ src: "plugin:elizacloud", agentId: config.agentId }, "Provisioning cloud database");
  const response = await provisionCloudDatabase(config.apiKey, baseUrl, config.agentId);
  if (!response.success || !response.connectionUrl) {
    import_core12.logger.error({
      src: "plugin:elizacloud",
      error: response.error,
      agentId: config.agentId
    }, "Failed to provision cloud database");
    return null;
  }
  import_core12.logger.info({ src: "plugin:elizacloud", agentId: config.agentId }, "Cloud database provisioned successfully");
  const adapter = import_node.default.createDatabaseAdapter({ postgresUrl: response.connectionUrl }, config.agentId);
  import_core12.logger.info({ src: "plugin:elizacloud", agentId: config.agentId }, "Cloud database adapter created using PostgreSQL connection");
  return adapter;
}
async function provisionCloudDatabase(apiKey, baseUrl, agentId) {
  try {
    const response = await fetch(`${baseUrl}/api/v1/database/provision`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        agentId,
        type: "postgresql"
      })
    });
    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Cloud database provisioning failed: ${response.status} ${errorText}`
      };
    }
    const data = await response.json();
    return {
      success: true,
      connectionUrl: data.connectionUrl,
      expiresAt: data.expiresAt
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Network error during database provisioning: ${message}`
    };
  }
}

class CloudDatabaseAdapter {
  config;
  adapter = null;
  constructor(config) {
    this.config = config;
  }
  async initialize() {
    if (this.adapter) {
      return this.adapter;
    }
    this.adapter = await createCloudDatabaseAdapter(this.config);
    return this.adapter;
  }
  getAdapter() {
    return this.adapter;
  }
}

// src/storage/service.ts
var import_core13 = require("@elizaos/core");
var DEFAULT_CLOUD_URL2 = "https://www.elizacloud.ai";
var STORAGE_ENDPOINT = "/api/v1/storage/files";
function createCloudStorageService(config) {
  return new CloudStorageService(config);
}

class CloudStorageService {
  apiKey;
  baseUrl;
  constructor(config) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || DEFAULT_CLOUD_URL2;
  }
  async upload(file, options = {}) {
    try {
      const formData = new FormData;
      let blob;
      if (Buffer.isBuffer(file)) {
        blob = new Blob([file], {
          type: options.contentType || "application/octet-stream"
        });
      } else {
        blob = file;
      }
      const filename = options.filename || (file instanceof File ? file.name : "file") || "upload";
      formData.append("file", blob, filename);
      if (options.metadata) {
        formData.append("metadata", JSON.stringify(options.metadata));
      }
      const response = await fetch(`${this.baseUrl}${STORAGE_ENDPOINT}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`
        },
        body: formData
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 402) {
          return {
            success: false,
            error: `Insufficient credits. Required: ${errorData.required || "unknown"}, Available: ${errorData.available || "unknown"}. Top up at ${errorData.topUpUrl || "/dashboard/billing"}`
          };
        }
        return {
          success: false,
          error: `Upload failed: ${response.status} ${errorData.error || "Unknown error"}`
        };
      }
      const data = await response.json();
      import_core13.logger.info({ src: "plugin:elizacloud", cost: data.cost, remaining: data.creditsRemaining }, "Storage upload successful");
      return {
        success: true,
        id: data.id,
        url: data.url,
        pathname: data.pathname,
        contentType: data.contentType,
        size: data.size,
        cost: data.cost,
        creditsRemaining: data.creditsRemaining
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      import_core13.logger.error({ src: "plugin:elizacloud", error }, "Storage upload failed");
      return {
        success: false,
        error: `Upload error: ${message}`
      };
    }
  }
  async download(id, url) {
    if (url) {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          import_core13.logger.error({ src: "plugin:elizacloud", status: response.status, url }, "Storage direct download failed");
          return null;
        }
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      } catch (error) {
        import_core13.logger.error({ src: "plugin:elizacloud", error }, "Storage direct download error");
        return null;
      }
    }
    try {
      const response = await fetch(`${this.baseUrl}${STORAGE_ENDPOINT}/${id}?download=true`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`
        },
        redirect: "follow"
      });
      if (!response.ok) {
        import_core13.logger.error({ src: "plugin:elizacloud", status: response.status }, "Storage download failed");
        return null;
      }
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      import_core13.logger.error({ src: "plugin:elizacloud", error }, "Storage download error");
      return null;
    }
  }
  async list(options = {}) {
    try {
      const params = new URLSearchParams;
      if (options.prefix)
        params.set("prefix", options.prefix);
      if (options.limit)
        params.set("limit", String(options.limit));
      if (options.cursor)
        params.set("cursor", options.cursor);
      const response = await fetch(`${this.baseUrl}${STORAGE_ENDPOINT}?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`
        }
      });
      if (!response.ok) {
        import_core13.logger.error({ src: "plugin:elizacloud", status: response.status }, "Storage list failed");
        return { items: [], hasMore: false };
      }
      const data = await response.json();
      return {
        items: data.items || [],
        cursor: data.cursor,
        hasMore: data.hasMore || false
      };
    } catch (error) {
      import_core13.logger.error({ src: "plugin:elizacloud", error }, "Storage list error");
      return { items: [], hasMore: false };
    }
  }
  async delete(id, url) {
    if (!url) {
      import_core13.logger.error({ src: "plugin:elizacloud" }, "Storage delete requires file URL");
      return false;
    }
    try {
      const params = new URLSearchParams({ url });
      const response = await fetch(`${this.baseUrl}${STORAGE_ENDPOINT}/${id}?${params.toString()}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${this.apiKey}`
        }
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        import_core13.logger.error({ src: "plugin:elizacloud", status: response.status, error: errorData.error }, "Storage delete failed");
        return false;
      }
      return true;
    } catch (error) {
      import_core13.logger.error({ src: "plugin:elizacloud", error }, "Storage delete error");
      return false;
    }
  }
  async getStats() {
    try {
      const response = await fetch(`${this.baseUrl}${STORAGE_ENDPOINT}?stats=true`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`
        }
      });
      if (!response.ok) {
        return null;
      }
      const data = await response.json();
      return {
        totalFiles: data.stats?.totalFiles || 0,
        totalSize: data.stats?.totalSize || 0,
        totalSizeGB: data.stats?.totalSizeGB || 0,
        pricing: data.pricing || {}
      };
    } catch (error) {
      import_core13.logger.error({ src: "plugin:elizacloud", error }, "Storage stats error");
      return null;
    }
  }
}
// src/database/direct-adapter.ts
var import_core14 = require("@elizaos/core");
var import_node2 = __toESM(require("@elizaos/plugin-sql/node"));
function createDatabaseAdapter(config, agentId) {
  const adapter = import_node2.default.createDatabaseAdapter({ postgresUrl: config.postgresUrl }, agentId);
  import_core14.logger.info({ src: "plugin:elizacloud", agentId }, "Direct database adapter created");
  return adapter;
}
async function createDirectDatabaseAdapter(config, agentId) {
  return createDatabaseAdapter(config, agentId);
}
// src/database/schema.ts
var import_node3 = __toESM(require("@elizaos/plugin-sql/node"));
var {
  agentTable,
  roomTable,
  participantTable,
  memoryTable,
  embeddingTable,
  entityTable,
  relationshipTable,
  componentTable,
  taskTable,
  logTable,
  cacheTable,
  worldTable,
  serverTable,
  messageTable,
  messageServerTable,
  messageServerAgentsTable,
  channelTable,
  channelParticipantsTable
} = import_node3.default.schema;
var serverAgentsTable = serverTable;
// src/index.ts
var cloudStorageInstance = null;
function getCloudStorage() {
  return cloudStorageInstance;
}
async function initializeCloudDatabase(runtime) {
  const apiKey = getApiKey(runtime);
  const baseUrl = getBaseURL(runtime);
  if (!apiKey) {
    import_core15.logger.warn({ src: "plugin:elizacloud" }, "Cloud database enabled but no API key found - skipping database initialization");
    return;
  }
  import_core15.logger.info({ src: "plugin:elizacloud", agentId: runtime.agentId }, "Initializing cloud database");
  const adapter = await createCloudDatabaseAdapter({
    apiKey,
    baseUrl,
    agentId: runtime.agentId
  });
  if (adapter) {
    runtime.registerDatabaseAdapter(adapter);
    import_core15.logger.info({ src: "plugin:elizacloud", agentId: runtime.agentId }, "Cloud database adapter registered successfully");
  } else {
    import_core15.logger.error({ src: "plugin:elizacloud", agentId: runtime.agentId }, "Failed to initialize cloud database adapter");
  }
}
function initializeCloudStorage(runtime) {
  const apiKey = getApiKey(runtime);
  const baseUrl = getBaseURL(runtime);
  if (!apiKey) {
    import_core15.logger.warn({ src: "plugin:elizacloud" }, "No API key found - cloud storage will not be available");
    return;
  }
  cloudStorageInstance = new CloudStorageService({
    apiKey,
    baseUrl
  });
  import_core15.logger.info({ src: "plugin:elizacloud", agentId: runtime.agentId }, "Cloud storage service initialized");
}
var elizaOSCloudPlugin = {
  name: "elizaOSCloud",
  description: "ElizaOS Cloud plugin - Complete AI, storage, and database solution. Provides multi-model inference (GPT-4, Claude, Gemini), embeddings, image generation, transcription, TTS, managed PostgreSQL database, and cloud file storage. A single plugin that replaces all other AI and database plugins.",
  config: {
    ELIZAOS_CLOUD_API_KEY: process.env.ELIZAOS_CLOUD_API_KEY,
    ELIZAOS_CLOUD_BASE_URL: process.env.ELIZAOS_CLOUD_BASE_URL,
    ELIZAOS_CLOUD_SMALL_MODEL: process.env.ELIZAOS_CLOUD_SMALL_MODEL,
    ELIZAOS_CLOUD_LARGE_MODEL: process.env.ELIZAOS_CLOUD_LARGE_MODEL,
    SMALL_MODEL: process.env.SMALL_MODEL,
    LARGE_MODEL: process.env.LARGE_MODEL,
    ELIZAOS_CLOUD_EMBEDDING_MODEL: process.env.ELIZAOS_CLOUD_EMBEDDING_MODEL,
    ELIZAOS_CLOUD_EMBEDDING_API_KEY: process.env.ELIZAOS_CLOUD_EMBEDDING_API_KEY,
    ELIZAOS_CLOUD_EMBEDDING_URL: process.env.ELIZAOS_CLOUD_EMBEDDING_URL,
    ELIZAOS_CLOUD_EMBEDDING_DIMENSIONS: process.env.ELIZAOS_CLOUD_EMBEDDING_DIMENSIONS,
    ELIZAOS_CLOUD_IMAGE_DESCRIPTION_MODEL: process.env.ELIZAOS_CLOUD_IMAGE_DESCRIPTION_MODEL,
    ELIZAOS_CLOUD_IMAGE_DESCRIPTION_MAX_TOKENS: process.env.ELIZAOS_CLOUD_IMAGE_DESCRIPTION_MAX_TOKENS,
    ELIZAOS_CLOUD_IMAGE_GENERATION_MODEL: process.env.ELIZAOS_CLOUD_IMAGE_GENERATION_MODEL,
    ELIZAOS_CLOUD_TTS_MODEL: process.env.ELIZAOS_CLOUD_TTS_MODEL,
    ELIZAOS_CLOUD_TTS_VOICE: process.env.ELIZAOS_CLOUD_TTS_VOICE,
    ELIZAOS_CLOUD_TRANSCRIPTION_MODEL: process.env.ELIZAOS_CLOUD_TRANSCRIPTION_MODEL,
    ELIZAOS_CLOUD_DATABASE: process.env.ELIZAOS_CLOUD_DATABASE,
    ELIZAOS_CLOUD_STORAGE: process.env.ELIZAOS_CLOUD_STORAGE,
    ELIZAOS_CLOUD_EXPERIMENTAL_TELEMETRY: process.env.ELIZAOS_CLOUD_EXPERIMENTAL_TELEMETRY
  },
  priority: -1,
  async init(config, runtime) {
    initializeOpenAI(config, runtime);
    if (!isBrowser()) {
      initializeCloudStorage(runtime);
    }
    const cloudDatabaseEnabled = runtime.getSetting("ELIZAOS_CLOUD_DATABASE") === "true" || process.env.ELIZAOS_CLOUD_DATABASE === "true";
    if (cloudDatabaseEnabled && !isBrowser()) {
      await initializeCloudDatabase(runtime);
    }
  },
  models: {
    [import_core15.ModelType.TEXT_SMALL]: handleTextSmall,
    [import_core15.ModelType.TEXT_LARGE]: handleTextLarge,
    [import_core15.ModelType.TEXT_REASONING_SMALL]: handleTextSmall,
    [import_core15.ModelType.TEXT_REASONING_LARGE]: handleTextLarge,
    [import_core15.ModelType.OBJECT_SMALL]: handleObjectSmall,
    [import_core15.ModelType.OBJECT_LARGE]: handleObjectLarge,
    [import_core15.ModelType.TEXT_EMBEDDING]: handleTextEmbedding,
    [import_core15.ModelType.TEXT_TOKENIZER_ENCODE]: handleTokenizerEncode,
    [import_core15.ModelType.TEXT_TOKENIZER_DECODE]: handleTokenizerDecode,
    [import_core15.ModelType.IMAGE]: handleImageGeneration,
    [import_core15.ModelType.IMAGE_DESCRIPTION]: handleImageDescription,
    [import_core15.ModelType.TRANSCRIPTION]: handleTranscription,
    [import_core15.ModelType.TEXT_TO_SPEECH]: handleTextToSpeech
  },
  tests: [
    {
      name: "ELIZAOS_CLOUD_plugin_tests",
      tests: [
        {
          name: "ELIZAOS_CLOUD_test_url_and_api_key_validation",
          fn: async (runtime) => {
            const baseURL = getBaseURL(runtime);
            const response = await fetch(`${baseURL}/models`, {
              headers: {
                Authorization: `Bearer ${getApiKey(runtime)}`
              }
            });
            const data = await response.json();
            import_core15.logger.log({ data: data?.data?.length ?? "N/A" }, "Models Available");
            if (!response.ok) {
              throw new Error(`Failed to validate OpenAI API key: ${response.statusText}`);
            }
          }
        },
        {
          name: "ELIZAOS_CLOUD_test_text_embedding",
          fn: async (runtime) => {
            try {
              const embedding = await runtime.useModel(import_core15.ModelType.TEXT_EMBEDDING, {
                text: "Hello, world!"
              });
              import_core15.logger.log({ embedding }, "embedding");
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              import_core15.logger.error(`Error in test_text_embedding: ${message}`);
              throw error;
            }
          }
        },
        {
          name: "ELIZAOS_CLOUD_test_text_large",
          fn: async (runtime) => {
            try {
              const text = await runtime.useModel(import_core15.ModelType.TEXT_LARGE, {
                prompt: "What is the nature of reality in 10 words?"
              });
              if (text.length === 0) {
                throw new Error("Failed to generate text");
              }
              import_core15.logger.log({ text }, "generated with test_text_large");
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              import_core15.logger.error(`Error in test_text_large: ${message}`);
              throw error;
            }
          }
        },
        {
          name: "ELIZAOS_CLOUD_test_text_small",
          fn: async (runtime) => {
            try {
              const text = await runtime.useModel(import_core15.ModelType.TEXT_SMALL, {
                prompt: "What is the nature of reality in 10 words?"
              });
              if (text.length === 0) {
                throw new Error("Failed to generate text");
              }
              import_core15.logger.log({ text }, "generated with test_text_small");
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              import_core15.logger.error(`Error in test_text_small: ${message}`);
              throw error;
            }
          }
        },
        {
          name: "ELIZAOS_CLOUD_test_image_generation",
          fn: async (runtime) => {
            import_core15.logger.log("ELIZAOS_CLOUD_test_image_generation");
            try {
              const image = await runtime.useModel(import_core15.ModelType.IMAGE, {
                prompt: "A beautiful sunset over a calm ocean",
                n: 1,
                size: "1024x1024"
              });
              import_core15.logger.log({ image }, "generated with test_image_generation");
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              import_core15.logger.error(`Error in test_image_generation: ${message}`);
              throw error;
            }
          }
        },
        {
          name: "image-description",
          fn: async (runtime) => {
            try {
              import_core15.logger.log("ELIZAOS_CLOUD_test_image_description");
              try {
                const result = await runtime.useModel(import_core15.ModelType.IMAGE_DESCRIPTION, "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/Vitalik_Buterin_TechCrunch_London_2015_%28cropped%29.jpg/537px-Vitalik_Buterin_TechCrunch_London_2015_%28cropped%29.jpg");
                if (result && typeof result === "object" && "title" in result && "description" in result) {
                  import_core15.logger.log({ result }, "Image description");
                } else {
                  import_core15.logger.error("Invalid image description result format:", result);
                }
              } catch (e) {
                const message = e instanceof Error ? e.message : String(e);
                import_core15.logger.error(`Error in image description test: ${message}`);
              }
            } catch (e) {
              const message = e instanceof Error ? e.message : String(e);
              import_core15.logger.error(`Error in ELIZAOS_CLOUD_test_image_description: ${message}`);
            }
          }
        },
        {
          name: "ELIZAOS_CLOUD_test_transcription",
          fn: async (runtime) => {
            import_core15.logger.log("ELIZAOS_CLOUD_test_transcription");
            try {
              const response = await fetch("https://upload.wikimedia.org/wikipedia/en/4/40/Chris_Benoit_Voice_Message.ogg");
              const arrayBuffer = await response.arrayBuffer();
              const transcription = await runtime.useModel(import_core15.ModelType.TRANSCRIPTION, Buffer.from(new Uint8Array(arrayBuffer)));
              import_core15.logger.log({ transcription }, "generated with test_transcription");
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              import_core15.logger.error(`Error in test_transcription: ${message}`);
              throw error;
            }
          }
        },
        {
          name: "ELIZAOS_CLOUD_test_text_tokenizer_encode",
          fn: async (runtime) => {
            const prompt = "Hello tokenizer encode!";
            const tokens = await runtime.useModel(import_core15.ModelType.TEXT_TOKENIZER_ENCODE, { prompt });
            if (!Array.isArray(tokens) || tokens.length === 0) {
              throw new Error("Failed to tokenize text: expected non-empty array of tokens");
            }
            import_core15.logger.log({ tokens }, "Tokenized output");
          }
        },
        {
          name: "ELIZAOS_CLOUD_test_text_tokenizer_decode",
          fn: async (runtime) => {
            const prompt = "Hello tokenizer decode!";
            const tokens = await runtime.useModel(import_core15.ModelType.TEXT_TOKENIZER_ENCODE, { prompt });
            const decodedText = await runtime.useModel(import_core15.ModelType.TEXT_TOKENIZER_DECODE, { tokens });
            if (decodedText !== prompt) {
              throw new Error(`Decoded text does not match original. Expected "${prompt}", got "${decodedText}"`);
            }
            import_core15.logger.log({ decodedText }, "Decoded text");
          }
        },
        {
          name: "ELIZAOS_CLOUD_test_text_to_speech",
          fn: async (runtime) => {
            try {
              const response = await fetchTextToSpeech(runtime, {
                text: "Hello, this is a test for text-to-speech."
              });
              if (!response) {
                throw new Error("Failed to generate speech");
              }
              import_core15.logger.log("Generated speech successfully");
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              import_core15.logger.error(`Error in ELIZAOS_CLOUD_test_text_to_speech: ${message}`);
              throw error;
            }
          }
        }
      ]
    }
  ]
};
var src_default = elizaOSCloudPlugin;

//# debugId=7F91E5A78C775CA264756E2164756E21
