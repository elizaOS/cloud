import { createRequire } from "node:module";
var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __require = /* @__PURE__ */ createRequire(import.meta.url);

// src/index.ts
import { logger as logger13, ModelType as ModelType6 } from "@elizaos/core";

// src/init.ts
import { logger as logger2 } from "@elizaos/core";

// src/utils/config.ts
import { logger } from "@elizaos/core";
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
    logger.debug(`[ELIZAOS_CLOUD] Using specific embedding base URL: ${embeddingURL}`);
    return embeddingURL;
  }
  logger.debug("[ELIZAOS_CLOUD] Falling back to general base URL for embeddings.");
  return getBaseURL(runtime);
}
function getApiKey(runtime) {
  return getSetting(runtime, "ELIZAOS_CLOUD_API_KEY");
}
function getEmbeddingApiKey(runtime) {
  const embeddingApiKey = getSetting(runtime, "ELIZAOS_CLOUD_EMBEDDING_API_KEY");
  if (embeddingApiKey) {
    logger.debug("[ELIZAOS_CLOUD] Using specific embedding API key (present)");
    return embeddingApiKey;
  }
  logger.debug("[ELIZAOS_CLOUD] Falling back to general API key for embeddings.");
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
  logger.debug(`[ELIZAOS_CLOUD] Experimental telemetry in function: "${setting}" (type: ${typeof setting}, normalized: "${normalizedSetting}", result: ${result})`);
  return result;
}

// src/init.ts
function initializeOpenAI(_config, runtime) {
  new Promise(async (resolve) => {
    resolve();
    try {
      if (!getApiKey(runtime) && !isBrowser()) {
        logger2.warn("ELIZAOS_CLOUD_API_KEY is not set in environment - ElizaOS Cloud functionality will be limited");
        logger2.info("Get your API key from https://www.elizacloud.ai/dashboard/api-keys");
        return;
      }
      try {
        const baseURL = getBaseURL(runtime);
        const response = await fetch(`${baseURL}/models`, {
          headers: { ...getAuthHeader(runtime) }
        });
        if (!response.ok) {
          logger2.warn(`ElizaOS Cloud API key validation failed: ${response.statusText}`);
          logger2.warn("ElizaOS Cloud functionality will be limited until a valid API key is provided");
          logger2.info("Get your API key from https://www.elizacloud.ai/dashboard/api-keys");
        } else {
          logger2.log("ElizaOS Cloud API key validated successfully");
        }
      } catch (fetchError) {
        const message = fetchError instanceof Error ? fetchError.message : String(fetchError);
        logger2.warn(`Error validating ElizaOS Cloud API key: ${message}`);
        logger2.warn("ElizaOS Cloud functionality will be limited until a valid API key is provided");
      }
    } catch (error) {
      const message = error?.errors?.map((e) => e.message).join(", ") || (error instanceof Error ? error.message : String(error));
      logger2.warn(`ElizaOS Cloud plugin configuration issue: ${message} - You need to configure the ELIZAOS_CLOUD_API_KEY in your environment variables`);
      logger2.info("Get your API key from https://www.elizacloud.ai/dashboard/api-keys");
    }
  });
}

// src/models/text.ts
import { logger as logger3, ModelType } from "@elizaos/core";
import { generateText } from "ai";

// src/providers/openai.ts
import { createOpenAI } from "@ai-sdk/openai";
function createOpenAIClient(runtime) {
  const baseURL = getBaseURL(runtime);
  const apiKey = getApiKey(runtime) ?? (isProxyMode(runtime) ? "eliza-proxy" : undefined);
  return createOpenAI({ apiKey: apiKey ?? "", baseURL });
}

// src/utils/events.ts
import {
  EventType
} from "@elizaos/core";
function emitModelUsageEvent(runtime, type, prompt, usage) {
  runtime.emitEvent(EventType.MODEL_USED, {
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
  logger3.log(`[ELIZAOS_CLOUD] Using TEXT_SMALL model: ${modelName}`);
  logger3.log(prompt);
  const { text: openaiResponse, usage } = await generateText({
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
    emitModelUsageEvent(runtime, ModelType.TEXT_SMALL, prompt, usage);
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
  logger3.log(`[ELIZAOS_CLOUD] Using TEXT_LARGE model: ${modelName}`);
  logger3.log(prompt);
  const { text: openaiResponse, usage } = await generateText({
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
    emitModelUsageEvent(runtime, ModelType.TEXT_LARGE, prompt, usage);
  }
  return openaiResponse;
}
// src/models/object.ts
import { logger as logger5, ModelType as ModelType2 } from "@elizaos/core";
import { generateObject, JSONParseError as JSONParseError2 } from "ai";

// src/utils/helpers.ts
import { logger as logger4 } from "@elizaos/core";
import { JSONParseError } from "ai";
function getJsonRepairFunction() {
  return async ({ text, error }) => {
    try {
      if (error instanceof JSONParseError) {
        const cleanedText = text.replace(/```json\n|\n```|```/g, "");
        JSON.parse(cleanedText);
        return cleanedText;
      }
      return null;
    } catch (jsonError) {
      const message = jsonError instanceof Error ? jsonError.message : String(jsonError);
      logger4.warn(`Failed to repair JSON text: ${message}`);
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
  logger4.warn("Could not detect audio format from buffer, using generic binary type");
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
    logger4.error(`Failed to load node:stream module: ${message}`);
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
  logger5.log(`[ELIZAOS_CLOUD] Using ${modelType} model: ${modelName}`);
  const temperature = params.temperature ?? 0;
  const schemaPresent = !!params.schema;
  if (schemaPresent) {
    logger5.info(`Using ${modelType} without schema validation (schema provided but output=no-schema)`);
  }
  try {
    const { object, usage } = await generateObject({
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
    if (error instanceof JSONParseError2) {
      logger5.error(`[generateObject] Failed to parse JSON: ${error.message}`);
      const repairFunction = getJsonRepairFunction();
      const repairedJsonString = await repairFunction({
        text: error.text,
        error
      });
      if (repairedJsonString) {
        try {
          const repairedObject = JSON.parse(repairedJsonString);
          logger5.info("[generateObject] Successfully repaired JSON.");
          return repairedObject;
        } catch (repairParseError) {
          const message = repairParseError instanceof Error ? repairParseError.message : String(repairParseError);
          logger5.error(`[generateObject] Failed to parse repaired JSON: ${message}`);
          throw repairParseError;
        }
      } else {
        logger5.error("[generateObject] JSON repair failed.");
        throw error;
      }
    } else {
      const message = error instanceof Error ? error.message : String(error);
      logger5.error(`[generateObject] Unknown error: ${message}`);
      throw error;
    }
  }
}
async function handleObjectSmall(runtime, params) {
  return generateObjectByModelType(runtime, params, ModelType2.OBJECT_SMALL, getSmallModel);
}
async function handleObjectLarge(runtime, params) {
  return generateObjectByModelType(runtime, params, ModelType2.OBJECT_LARGE, getLargeModel);
}
// src/models/embeddings.ts
import { logger as logger6, ModelType as ModelType3, VECTOR_DIMS } from "@elizaos/core";
async function handleTextEmbedding(runtime, params) {
  const embeddingModelName = getSetting(runtime, "ELIZAOS_CLOUD_EMBEDDING_MODEL", "text-embedding-3-small");
  const embeddingDimension = Number.parseInt(getSetting(runtime, "ELIZAOS_CLOUD_EMBEDDING_DIMENSIONS", "1536") || "1536", 10);
  if (!Object.values(VECTOR_DIMS).includes(embeddingDimension)) {
    const errorMsg = `Invalid embedding dimension: ${embeddingDimension}. Must be one of: ${Object.values(VECTOR_DIMS).join(", ")}`;
    logger6.error(errorMsg);
    throw new Error(errorMsg);
  }
  if (params === null) {
    logger6.debug("Creating test embedding for initialization");
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
    logger6.warn("Invalid input format for embedding");
    const fallbackVector = Array(embeddingDimension).fill(0);
    fallbackVector[0] = 0.2;
    return fallbackVector;
  }
  if (!text.trim()) {
    logger6.warn("Empty text for embedding");
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
      logger6.error(`ElizaOS Cloud API error: ${response.status} - ${response.statusText}`);
      const errorVector = Array(embeddingDimension).fill(0);
      errorVector[0] = 0.4;
      return errorVector;
    }
    const data = await response.json();
    if (!data?.data?.[0]?.embedding) {
      logger6.error("API returned invalid structure");
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
      emitModelUsageEvent(runtime, ModelType3.TEXT_EMBEDDING, text, usage);
    }
    logger6.log(`Got valid embedding with length ${embedding.length}`);
    return embedding;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger6.error(`Error generating embedding: ${message}`);
    const errorVector = Array(embeddingDimension).fill(0);
    errorVector[0] = 0.6;
    return errorVector;
  }
}
// src/models/image.ts
import { logger as logger7, ModelType as ModelType4 } from "@elizaos/core";
async function handleImageGeneration(runtime, params) {
  const numImages = params.n || 1;
  const size = params.size || "1024x1024";
  const prompt = params.prompt;
  const modelName = getImageGenerationModel(runtime);
  logger7.log(`[ELIZAOS_CLOUD] Using IMAGE model: ${modelName}`);
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
    logger7.error(`[ELIZAOS_CLOUD] Image generation error: ${message}`);
    throw error;
  }
}
async function handleImageDescription(runtime, params) {
  let imageUrl;
  let promptText;
  const modelName = getImageDescriptionModel(runtime);
  logger7.log(`[ELIZAOS_CLOUD] Using IMAGE_DESCRIPTION model: ${modelName}`);
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
      emitModelUsageEvent(runtime, ModelType4.IMAGE_DESCRIPTION, typeof params === "string" ? params : params.prompt || "", {
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
    logger7.error(`Error analyzing image: ${message}`);
    return {
      title: "Failed to analyze image",
      description: `Error: ${message}`
    };
  }
}
// src/models/transcription.ts
import { logger as logger8 } from "@elizaos/core";
async function handleTranscription(runtime, input) {
  let modelName = getSetting(runtime, "ELIZAOS_CLOUD_TRANSCRIPTION_MODEL", "gpt-4o-mini-transcribe");
  logger8.log(`[ELIZAOS_CLOUD] Using TRANSCRIPTION model: ${modelName}`);
  const baseURL = getBaseURL(runtime);
  let blob;
  let extraParams = null;
  if (input instanceof Blob || input instanceof File) {
    blob = input;
  } else if (Buffer.isBuffer(input)) {
    const detectedMimeType = detectAudioMimeType(input);
    logger8.debug(`Auto-detected audio MIME type: ${detectedMimeType}`);
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
        logger8.debug(`Auto-detected audio MIME type: ${mimeType}`);
      } else {
        logger8.debug(`Using provided MIME type: ${mimeType}`);
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
    logger8.error(`TRANSCRIPTION error: ${message}`);
    throw error;
  }
}
// src/models/speech.ts
import { logger as logger9 } from "@elizaos/core";
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
  logger9.log(`[ELIZAOS_CLOUD] Using TEXT_TO_SPEECH model: ${resolvedModel}`);
  try {
    const speechStream = await fetchTextToSpeech(runtime, options);
    return speechStream;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger9.error(`Error in TEXT_TO_SPEECH: ${message}`);
    throw error;
  }
}
// src/models/tokenization.ts
import { ModelType as ModelType5 } from "@elizaos/core";
import { encodingForModel } from "js-tiktoken";
async function tokenizeText(model, prompt) {
  const modelName = model === ModelType5.TEXT_SMALL ? process.env.ELIZAOS_CLOUD_SMALL_MODEL ?? process.env.SMALL_MODEL ?? "gpt-5-nano" : process.env.LARGE_MODEL ?? "gpt-5-mini";
  const tokens = encodingForModel(modelName).encode(prompt);
  return tokens;
}
async function detokenizeText(model, tokens) {
  const modelName = model === ModelType5.TEXT_SMALL ? process.env.ELIZAOS_CLOUD_SMALL_MODEL ?? process.env.SMALL_MODEL ?? "gpt-5-nano" : process.env.ELIZAOS_CLOUD_LARGE_MODEL ?? process.env.LARGE_MODEL ?? "gpt-5-mini";
  return encodingForModel(modelName).decode(tokens);
}
async function handleTokenizerEncode(_runtime, { prompt, modelType = ModelType5.TEXT_LARGE }) {
  return await tokenizeText(modelType ?? ModelType5.TEXT_LARGE, prompt);
}
async function handleTokenizerDecode(_runtime, { tokens, modelType = ModelType5.TEXT_LARGE }) {
  return await detokenizeText(modelType ?? ModelType5.TEXT_LARGE, tokens);
}
// src/database/adapter.ts
import { logger as logger10 } from "@elizaos/core";
import pluginSql from "@elizaos/plugin-sql/node";
var DEFAULT_CLOUD_URL = "https://www.elizacloud.ai";
async function createCloudDatabaseAdapter(config) {
  const baseUrl = config.baseUrl || DEFAULT_CLOUD_URL;
  logger10.info({ src: "plugin:elizacloud", agentId: config.agentId }, "Provisioning cloud database");
  const response = await provisionCloudDatabase(config.apiKey, baseUrl, config.agentId);
  if (!response.success || !response.connectionUrl) {
    logger10.error({
      src: "plugin:elizacloud",
      error: response.error,
      agentId: config.agentId
    }, "Failed to provision cloud database");
    return null;
  }
  logger10.info({ src: "plugin:elizacloud", agentId: config.agentId }, "Cloud database provisioned successfully");
  const adapter = pluginSql.createDatabaseAdapter({ postgresUrl: response.connectionUrl }, config.agentId);
  logger10.info({ src: "plugin:elizacloud", agentId: config.agentId }, "Cloud database adapter created using PostgreSQL connection");
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
import { logger as logger11 } from "@elizaos/core";
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
      logger11.info({ src: "plugin:elizacloud", cost: data.cost, remaining: data.creditsRemaining }, "Storage upload successful");
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
      logger11.error({ src: "plugin:elizacloud", error }, "Storage upload failed");
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
          logger11.error({ src: "plugin:elizacloud", status: response.status, url }, "Storage direct download failed");
          return null;
        }
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      } catch (error) {
        logger11.error({ src: "plugin:elizacloud", error }, "Storage direct download error");
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
        logger11.error({ src: "plugin:elizacloud", status: response.status }, "Storage download failed");
        return null;
      }
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      logger11.error({ src: "plugin:elizacloud", error }, "Storage download error");
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
        logger11.error({ src: "plugin:elizacloud", status: response.status }, "Storage list failed");
        return { items: [], hasMore: false };
      }
      const data = await response.json();
      return {
        items: data.items || [],
        cursor: data.cursor,
        hasMore: data.hasMore || false
      };
    } catch (error) {
      logger11.error({ src: "plugin:elizacloud", error }, "Storage list error");
      return { items: [], hasMore: false };
    }
  }
  async delete(id, url) {
    if (!url) {
      logger11.error({ src: "plugin:elizacloud" }, "Storage delete requires file URL");
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
        logger11.error({ src: "plugin:elizacloud", status: response.status, error: errorData.error }, "Storage delete failed");
        return false;
      }
      return true;
    } catch (error) {
      logger11.error({ src: "plugin:elizacloud", error }, "Storage delete error");
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
      logger11.error({ src: "plugin:elizacloud", error }, "Storage stats error");
      return null;
    }
  }
}
// src/database/direct-adapter.ts
import { logger as logger12 } from "@elizaos/core";
import pluginSql2 from "@elizaos/plugin-sql/node";
function createDatabaseAdapter(config, agentId) {
  const adapter = pluginSql2.createDatabaseAdapter({ postgresUrl: config.postgresUrl }, agentId);
  logger12.info({ src: "plugin:elizacloud", agentId }, "Direct database adapter created");
  return adapter;
}
async function createDirectDatabaseAdapter(config, agentId) {
  return createDatabaseAdapter(config, agentId);
}
// src/database/schema.ts
import pluginSql3 from "@elizaos/plugin-sql/node";
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
} = pluginSql3.schema;
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
    logger13.warn({ src: "plugin:elizacloud" }, "Cloud database enabled but no API key found - skipping database initialization");
    return;
  }
  logger13.info({ src: "plugin:elizacloud", agentId: runtime.agentId }, "Initializing cloud database");
  const adapter = await createCloudDatabaseAdapter({
    apiKey,
    baseUrl,
    agentId: runtime.agentId
  });
  if (adapter) {
    runtime.registerDatabaseAdapter(adapter);
    logger13.info({ src: "plugin:elizacloud", agentId: runtime.agentId }, "Cloud database adapter registered successfully");
  } else {
    logger13.error({ src: "plugin:elizacloud", agentId: runtime.agentId }, "Failed to initialize cloud database adapter");
  }
}
function initializeCloudStorage(runtime) {
  const apiKey = getApiKey(runtime);
  const baseUrl = getBaseURL(runtime);
  if (!apiKey) {
    logger13.warn({ src: "plugin:elizacloud" }, "No API key found - cloud storage will not be available");
    return;
  }
  cloudStorageInstance = new CloudStorageService({
    apiKey,
    baseUrl
  });
  logger13.info({ src: "plugin:elizacloud", agentId: runtime.agentId }, "Cloud storage service initialized");
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
    [ModelType6.TEXT_SMALL]: handleTextSmall,
    [ModelType6.TEXT_LARGE]: handleTextLarge,
    [ModelType6.TEXT_REASONING_SMALL]: handleTextSmall,
    [ModelType6.TEXT_REASONING_LARGE]: handleTextLarge,
    [ModelType6.OBJECT_SMALL]: handleObjectSmall,
    [ModelType6.OBJECT_LARGE]: handleObjectLarge,
    [ModelType6.TEXT_EMBEDDING]: handleTextEmbedding,
    [ModelType6.TEXT_TOKENIZER_ENCODE]: handleTokenizerEncode,
    [ModelType6.TEXT_TOKENIZER_DECODE]: handleTokenizerDecode,
    [ModelType6.IMAGE]: handleImageGeneration,
    [ModelType6.IMAGE_DESCRIPTION]: handleImageDescription,
    [ModelType6.TRANSCRIPTION]: handleTranscription,
    [ModelType6.TEXT_TO_SPEECH]: handleTextToSpeech
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
            logger13.log({ data: data?.data?.length ?? "N/A" }, "Models Available");
            if (!response.ok) {
              throw new Error(`Failed to validate OpenAI API key: ${response.statusText}`);
            }
          }
        },
        {
          name: "ELIZAOS_CLOUD_test_text_embedding",
          fn: async (runtime) => {
            try {
              const embedding = await runtime.useModel(ModelType6.TEXT_EMBEDDING, {
                text: "Hello, world!"
              });
              logger13.log({ embedding }, "embedding");
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              logger13.error(`Error in test_text_embedding: ${message}`);
              throw error;
            }
          }
        },
        {
          name: "ELIZAOS_CLOUD_test_text_large",
          fn: async (runtime) => {
            try {
              const text = await runtime.useModel(ModelType6.TEXT_LARGE, {
                prompt: "What is the nature of reality in 10 words?"
              });
              if (text.length === 0) {
                throw new Error("Failed to generate text");
              }
              logger13.log({ text }, "generated with test_text_large");
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              logger13.error(`Error in test_text_large: ${message}`);
              throw error;
            }
          }
        },
        {
          name: "ELIZAOS_CLOUD_test_text_small",
          fn: async (runtime) => {
            try {
              const text = await runtime.useModel(ModelType6.TEXT_SMALL, {
                prompt: "What is the nature of reality in 10 words?"
              });
              if (text.length === 0) {
                throw new Error("Failed to generate text");
              }
              logger13.log({ text }, "generated with test_text_small");
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              logger13.error(`Error in test_text_small: ${message}`);
              throw error;
            }
          }
        },
        {
          name: "ELIZAOS_CLOUD_test_image_generation",
          fn: async (runtime) => {
            logger13.log("ELIZAOS_CLOUD_test_image_generation");
            try {
              const image = await runtime.useModel(ModelType6.IMAGE, {
                prompt: "A beautiful sunset over a calm ocean",
                n: 1,
                size: "1024x1024"
              });
              logger13.log({ image }, "generated with test_image_generation");
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              logger13.error(`Error in test_image_generation: ${message}`);
              throw error;
            }
          }
        },
        {
          name: "image-description",
          fn: async (runtime) => {
            try {
              logger13.log("ELIZAOS_CLOUD_test_image_description");
              try {
                const result = await runtime.useModel(ModelType6.IMAGE_DESCRIPTION, "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/Vitalik_Buterin_TechCrunch_London_2015_%28cropped%29.jpg/537px-Vitalik_Buterin_TechCrunch_London_2015_%28cropped%29.jpg");
                if (result && typeof result === "object" && "title" in result && "description" in result) {
                  logger13.log({ result }, "Image description");
                } else {
                  logger13.error("Invalid image description result format:", result);
                }
              } catch (e) {
                const message = e instanceof Error ? e.message : String(e);
                logger13.error(`Error in image description test: ${message}`);
              }
            } catch (e) {
              const message = e instanceof Error ? e.message : String(e);
              logger13.error(`Error in ELIZAOS_CLOUD_test_image_description: ${message}`);
            }
          }
        },
        {
          name: "ELIZAOS_CLOUD_test_transcription",
          fn: async (runtime) => {
            logger13.log("ELIZAOS_CLOUD_test_transcription");
            try {
              const response = await fetch("https://upload.wikimedia.org/wikipedia/en/4/40/Chris_Benoit_Voice_Message.ogg");
              const arrayBuffer = await response.arrayBuffer();
              const transcription = await runtime.useModel(ModelType6.TRANSCRIPTION, Buffer.from(new Uint8Array(arrayBuffer)));
              logger13.log({ transcription }, "generated with test_transcription");
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              logger13.error(`Error in test_transcription: ${message}`);
              throw error;
            }
          }
        },
        {
          name: "ELIZAOS_CLOUD_test_text_tokenizer_encode",
          fn: async (runtime) => {
            const prompt = "Hello tokenizer encode!";
            const tokens = await runtime.useModel(ModelType6.TEXT_TOKENIZER_ENCODE, { prompt });
            if (!Array.isArray(tokens) || tokens.length === 0) {
              throw new Error("Failed to tokenize text: expected non-empty array of tokens");
            }
            logger13.log({ tokens }, "Tokenized output");
          }
        },
        {
          name: "ELIZAOS_CLOUD_test_text_tokenizer_decode",
          fn: async (runtime) => {
            const prompt = "Hello tokenizer decode!";
            const tokens = await runtime.useModel(ModelType6.TEXT_TOKENIZER_ENCODE, { prompt });
            const decodedText = await runtime.useModel(ModelType6.TEXT_TOKENIZER_DECODE, { tokens });
            if (decodedText !== prompt) {
              throw new Error(`Decoded text does not match original. Expected "${prompt}", got "${decodedText}"`);
            }
            logger13.log({ decodedText }, "Decoded text");
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
              logger13.log("Generated speech successfully");
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              logger13.error(`Error in ELIZAOS_CLOUD_test_text_to_speech: ${message}`);
              throw error;
            }
          }
        }
      ]
    }
  ]
};
var src_default = elizaOSCloudPlugin;
export {
  worldTable,
  taskTable,
  serverTable,
  serverAgentsTable,
  roomTable,
  relationshipTable,
  pluginSql3 as pluginSql,
  participantTable,
  messageTable,
  messageServerTable,
  messageServerAgentsTable,
  memoryTable,
  logTable,
  getCloudStorage,
  entityTable,
  embeddingTable,
  elizaOSCloudPlugin,
  src_default as default,
  createDirectDatabaseAdapter,
  createDatabaseAdapter,
  createCloudStorageService,
  createCloudDatabaseAdapter,
  componentTable,
  channelTable,
  channelParticipantsTable,
  cacheTable,
  agentTable,
  CloudStorageService,
  CloudDatabaseAdapter
};

//# debugId=1EA438C51CA2A03164756E2164756E21
