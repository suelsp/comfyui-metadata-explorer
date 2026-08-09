"use strict";

/*
 * ============================================================
 * ComfyUI Metadata Explorer
 * ============================================================
 *
 * Completely client-side.
 *
 * Supported:
 *
 *   PNG
 *     - tEXt
 *     - zTXt
 *     - iTXt
 *     - arbitrary PNG chunks
 *
 *   ComfyUI
 *     - prompt
 *     - workflow
 *     - extra_pnginfo
 *
 *   JSON
 *     - workflow format
 *     - API/prompt format
 *
 * No files are uploaded anywhere.
 *
 * ============================================================
 */


/* ============================================================
   DOM
============================================================ */

const $ = (selector) => document.querySelector(selector);

const dropZone = $("#dropZone");
const fileInput = $("#fileInput");
const chooseFileBtn = $("#chooseFileBtn");
const clearBtn = $("#clearBtn");

const errorBox = $("#errorBox");
const errorText = $("#errorText");

const fileInfo = $("#fileInfo");
const toolbar = $("#toolbar");
const content = $("#content");

const imagePreview = $("#imagePreview");
const largeImage = $("#largeImage");

const fileName = $("#fileName");
const formatBadge = $("#formatBadge");
const fileSize = $("#fileSize");
const dimensions = $("#dimensions");
const chunkCount = $("#chunkCount");
const comfyStatus = $("#comfyStatus");

const positivePrompt = $("#positivePrompt");
const negativePrompt = $("#negativePrompt");
const modelSummary = $("#modelSummary");
const nodeSummary = $("#nodeSummary");

const parametersGrid = $("#parametersGrid");
const metadataTable = $("#metadataTable");

const promptJson = $("#promptJson");
const workflowJson = $("#workflowJson");

const nodesList = $("#nodesList");
const chunksList = $("#chunksList");

const exportPromptBtn = $("#exportPromptBtn");
const exportWorkflowBtn = $("#exportWorkflowBtn");

const copyPromptBtn = $("#copyPromptBtn");
const copyWorkflowBtn = $("#copyWorkflowBtn");

const downloadPromptBtn = $("#downloadPromptBtn");
const downloadWorkflowBtn = $("#downloadWorkflowBtn");

const promptSearch = $("#promptSearch");
const workflowSearch = $("#workflowSearch");
const nodeSearch = $("#nodeSearch");

const toast = $("#toast");


/* ============================================================
   STATE
============================================================ */

const state = {
  file: null,

  objectUrl: null,

  imageInfo: null,

  chunks: [],

  metadata: {},

  prompt: null,

  workflow: null,

  format: null,

  nodes: [],

  parameters: {},

  prompts: {
    positive: "",
    negative: ""
  },

  models: [],

  rawPromptText: "",

  rawWorkflowText: ""
};


/* ============================================================
   EVENTS
============================================================ */

chooseFileBtn.addEventListener(
  "click",
  () => fileInput.click()
);


fileInput.addEventListener(
  "change",
  async () => {

    const file = fileInput.files?.[0];

    if (file) {
      await loadFile(file);
    }

  }
);


clearBtn.addEventListener(
  "click",
  clearApplication
);


dropZone.addEventListener(
  "dragover",
  (event) => {

    event.preventDefault();

    dropZone.classList.add("dragover");

  }
);


dropZone.addEventListener(
  "dragleave",
  () => {

    dropZone.classList.remove("dragover");

  }
);


dropZone.addEventListener(
  "drop",
  async (event) => {

    event.preventDefault();

    dropZone.classList.remove("dragover");

    const file = event.dataTransfer.files?.[0];

    if (file) {
      await loadFile(file);
    }

  }
);


dropZone.addEventListener(
  "keydown",
  (event) => {

    if (
      event.key === "Enter" ||
      event.key === " "
    ) {
      event.preventDefault();

      fileInput.click();
    }

  }
);


/* ============================================================
   TABS
============================================================ */

document.querySelectorAll(".tab").forEach(
  (tab) => {

    tab.addEventListener(
      "click",
      () => {

        const name = tab.dataset.tab;

        document
          .querySelectorAll(".tab")
          .forEach(
            (item) =>
              item.classList.toggle(
                "active",
                item === tab
              )
          );

        document
          .querySelectorAll(".panel")
          .forEach(
            (panel) =>
              panel.classList.toggle(
                "active",
                panel.id === `panel-${name}`
              )
          );

      }
    );

  }
);


/* ============================================================
   SEARCH
============================================================ */

promptSearch.addEventListener(
  "input",
  () => {

    renderJson(
      promptJson,
      state.rawPromptText,
      promptSearch.value
    );

  }
);


workflowSearch.addEventListener(
  "input",
  () => {

    renderJson(
      workflowJson,
      state.rawWorkflowText,
      workflowSearch.value
    );

  }
);


nodeSearch.addEventListener(
  "input",
  renderNodes
);


/* ============================================================
   LOAD FILE
============================================================ */

async function loadFile(file) {

  clearError();

  try {

    if (!isSupportedFile(file)) {
      throw new Error(
        "Unsupported file. Please select a PNG or WebP image."
      );
    }

    state.file = file;

    cleanupObjectUrl();

    state.objectUrl =
      URL.createObjectURL(file);

    imagePreview.src = state.objectUrl;
    largeImage.src = state.objectUrl;

    fileName.textContent =
      file.name || "Image";

    fileSize.textContent =
      formatBytes(file.size);

    formatBadge.textContent =
      getFileFormat(file);

    fileInfo.classList.remove("hidden");

    const buffer =
      await file.arrayBuffer();

    if (isPNG(buffer)) {

      await parsePNG(buffer);

    } else if (isWebP(buffer)) {

      await parseWebP(buffer);

    } else {

      throw new Error(
        "The selected file does not appear to be a supported PNG or WebP."
      );

    }

    analyzeComfyData();

    renderEverything();

    toolbar.classList.remove("hidden");
    content.classList.remove("hidden");

    window.scrollTo({
      top: fileInfo.offsetTop - 80,
      behavior: "smooth"
    });

  } catch (error) {

    console.error(error);

    showError(
      error?.message ||
      "Unable to read the image."
    );

  }

}


/* ============================================================
   FILE DETECTION
============================================================ */

function isSupportedFile(file) {

  const name =
    (file.name || "").toLowerCase();

  return (
    file.type === "image/png" ||
    file.type === "image/webp" ||
    name.endsWith(".png") ||
    name.endsWith(".webp")
  );

}


function getFileFormat(file) {

  const name =
    (file.name || "").toLowerCase();

  if (
    file.type === "image/webp" ||
    name.endsWith(".webp")
  ) {
    return "WEBP";
  }

  return "PNG";
}


/* ============================================================
   PNG PARSER
============================================================ */

async function parsePNG(buffer) {

  state.chunks = [];
  state.metadata = {};

  state.prompt = null;
  state.workflow = null;

  const bytes =
    new Uint8Array(buffer);

  if (!isPNG(buffer)) {
    throw new Error("Invalid PNG file.");
  }

  const view =
    new DataView(buffer);

  let offset = 8;

  while (
    offset + 12 <= bytes.length
  ) {

    const length =
      view.getUint32(
        offset,
        false
      );

    const typeBytes =
      bytes.slice(
        offset + 4,
        offset + 8
      );

    const type =
      asciiDecode(typeBytes);

    const dataStart =
      offset + 8;

    const dataEnd =
      dataStart + length;

    const crcStart =
      dataEnd;

    if (
      dataEnd > bytes.length ||
      crcStart + 4 > bytes.length
    ) {
      break;
    }

    const data =
      bytes.slice(
        dataStart,
        dataEnd
      );

    const crc =
      view.getUint32(
        crcStart,
        false
      );

    const chunk = {
      type,
      length,
      crc,
      data
    };

    state.chunks.push(chunk);

    await decodePNGMetadataChunk(chunk);

    offset =
      dataEnd + 4;

    if (type === "IEND") {
      break;
    }

  }

  state.imageInfo =
    parsePNGDimensions(buffer);

  dimensions.textContent =
    state.imageInfo
      ? `${state.imageInfo.width} × ${state.imageInfo.height}`
      : "Unknown";

  chunkCount.textContent =
    String(state.chunks.length);

  state.format = "PNG";
}


/* ============================================================
   PNG DIMENSIONS
============================================================ */

function parsePNGDimensions(buffer) {

  const view =
    new DataView(buffer);

  if (
    view.byteLength < 24
  ) {
    return null;
  }

  return {
    width:
      view.getUint32(16, false),

    height:
      view.getUint32(20, false)
  };

}


/* ============================================================
   PNG METADATA
============================================================ */

async function decodePNGMetadataChunk(chunk) {

  try {

    if (chunk.type === "tEXt") {

      const parsed =
        parseTEXT(chunk.data);

      if (parsed) {
        storeMetadata(
          parsed.key,
          parsed.text,
          chunk.type
        );
      }

      return;
    }


    if (chunk.type === "zTXt") {

      const parsed =
        parseZTXTHeader(chunk.data);

      if (!parsed) return;

      const decompressed =
        await inflateZlib(
          parsed.compressed
        );

      const text =
        latin1Decode(decompressed);

      storeMetadata(
        parsed.key,
        text,
        chunk.type
      );

      return;
    }


    if (chunk.type === "iTXt") {

      const parsed =
        parseITXT(chunk.data);

      if (!parsed) return;

      let text =
        parsed.textBytes;

      if (parsed.compressed) {

        text =
          await inflateZlib(text);

      }

      const decoded =
        utf8Decode(text);

      storeMetadata(
        parsed.keyword,
        decoded,
        chunk.type
      );

    }

  } catch (error) {

    console.warn(
      "Metadata chunk could not be decoded:",
      chunk.type,
      error
    );

  }

}


/* ============================================================
   tEXt
============================================================ */

function parseTEXT(bytes) {

  const separator =
    bytes.indexOf(0);

  if (separator < 0) {
    return null;
  }

  return {
    key:
      latin1Decode(
        bytes.slice(0, separator)
      ),

    text:
      latin1Decode(
        bytes.slice(separator + 1)
      )
  };

}


/* ============================================================
   zTXt
============================================================ */

function parseZTXTHeader(bytes) {

  const separator =
    bytes.indexOf(0);

  if (
    separator < 0 ||
    separator + 2 > bytes.length
  ) {
    return null;
  }

  const compressionMethod =
    bytes[separator + 1];

  if (compressionMethod !== 0) {
    return null;
  }

  return {
    key:
      latin1Decode(
        bytes.slice(0, separator)
      ),

    compressed:
      bytes.slice(separator + 2)
  };

}


/* ============================================================
   iTXt
============================================================ */

function parseITXT(bytes) {

  let offset = 0;

  const keywordEnd =
    bytes.indexOf(0, offset);

  if (keywordEnd < 0) {
    return null;
  }

  const keyword =
    utf8Decode(
      bytes.slice(
        offset,
        keywordEnd
      )
    );

  offset =
    keywordEnd + 1;

  if (offset + 2 > bytes.length) {
    return null;
  }

  const compressionFlag =
    bytes[offset++];

  const compressionMethod =
    bytes[offset++];

  if (
    compressionFlag !== 0 &&
    compressionFlag !== 1
  ) {
    return null;
  }

  if (
    compressionFlag === 1 &&
    compressionMethod !== 0
  ) {
    return null;
  }

  const languageEnd =
    bytes.indexOf(0, offset);

  if (languageEnd < 0) {
    return null;
  }

  offset =
    languageEnd + 1;

  const translatedEnd =
    bytes.indexOf(0, offset);

  if (translatedEnd < 0) {
    return null;
  }

  offset =
    translatedEnd + 1;

  return {
    keyword,

    compressed:
      compressionFlag === 1,

    textBytes:
      bytes.slice(offset)
  };

}


/* ============================================================
   METADATA STORE
============================================================ */

function storeMetadata(
  key,
  value,
  chunkType
) {

  const normalized =
    String(key)
      .trim()
      .toLowerCase();

  if (
    state.metadata[key] === undefined
  ) {

    state.metadata[key] = value;

  } else if (
    Array.isArray(
      state.metadata[key]
    )
  ) {

    state.metadata[key].push(value);

  } else {

    state.metadata[key] = [
      state.metadata[key],
      value
    ];

  }

  /*
   * ComfyUI normally uses:
   *
   * prompt
   * workflow
   *
   * There can also be other keys.
   */

  if (
    normalized === "prompt"
  ) {

    const parsed =
      tryJSON(value);

    if (parsed !== null) {
      state.prompt = parsed;
    }

  }


  if (
    normalized === "workflow"
  ) {

    const parsed =
      tryJSON(value);

    if (parsed !== null) {
      state.workflow = parsed;
    }

  }

}


/* ============================================================
   WEBP
============================================================ */

async function parseWebP(buffer) {

  /*
   * WebP is RIFF:
   *
   * RIFF
   * size
   * WEBP
   *
   * We inspect EXIF / XMP chunks where possible.
   *
   * ComfyUI PNG metadata is the main target, but supporting
   * WebP makes the viewer useful for newer workflows too.
   */

  const bytes =
    new Uint8Array(buffer);

  const view =
    new DataView(buffer);

  if (
    asciiDecode(
      bytes.slice(0, 4)
    ) !== "RIFF" ||
    asciiDecode(
      bytes.slice(8, 12)
    ) !== "WEBP"
  ) {
    throw new Error(
      "Invalid WebP file."
    );
  }

  state.chunks = [];
  state.metadata = {};

  state.prompt = null;
  state.workflow = null;

  let offset = 12;

  while (
    offset + 8 <= bytes.length
  ) {

    const type =
      asciiDecode(
        bytes.slice(
          offset,
          offset + 4
        )
      );

    const size =
      view.getUint32(
        offset + 4,
        true
      );

    const dataStart =
      offset + 8;

    const dataEnd =
      Math.min(
        dataStart + size,
        bytes.length
      );

    const data =
      bytes.slice(
        dataStart,
        dataEnd
      );

    state.chunks.push({
      type,
      length: data.length,
      crc: null,
      data
    });

    /*
     * WebP XMP chunks commonly contain XML
     * containing embedded metadata.
     */

    if (
      type === "XMP "
    ) {

      const text =
        utf8Decode(data);

      extractJSONFromText(
        text
      );

      state.metadata.XMP =
        text;

    }


    if (
      type === "EXIF"
    ) {

      state.metadata.EXIF =
        bytesToHex(data);

    }

    offset =
      dataStart +
      size +
      (size % 2);

  }

  state.format = "WEBP";

  dimensions.textContent =
    "Detected WebP";

  chunkCount.textContent =
    String(state.chunks.length);

}


/* ============================================================
   JSON EXTRACTION
============================================================ */

function extractJSONFromText(text) {

  const candidates = [
    "prompt",
    "workflow"
  ];

  for (
    const key of candidates
  ) {

    const regex =
      new RegExp(
        `${key}\\s*[:=]\\s*([\\{\\[].*?)`,
        "is"
      );

    const match =
      text.match(regex);

    if (!match) continue;

    const parsed =
      tryJSON(
        match[1]
      );

    if (
      key === "prompt" &&
      parsed
    ) {
      state.prompt = parsed;
    }

    if (
      key === "workflow" &&
      parsed
    ) {
      state.workflow = parsed;
    }

  }

}


/* ============================================================
   COMFYUI ANALYSIS
============================================================ */

function analyzeComfyData() {

  /*
   * A ComfyUI API prompt is usually:
   *
   * {
   *   "3": {
   *     "class_type": "...",
   *     "inputs": {...}
   *   }
   * }
   *
   * A visual workflow usually has:
   *
   * {
   *   "nodes": [...],
   *   "links": [...]
   * }
   */

  if (
    !state.prompt &&
    !state.workflow
  ) {

    state.format = state.format || "IMAGE";

    comfyStatus.textContent =
      "Not detected";

    comfyStatus.style.color =
      "var(--text-muted)";

    return;

  }


  comfyStatus.textContent =
    "Detected";

  comfyStatus.style.color =
    "var(--green)";


  state.nodes =
    extractNodes(
      state.prompt,
      state.workflow
    );


  state.parameters =
    extractParameters(
      state.prompt,
      state.workflow
    );


  state.prompts =
    extractPrompts(
      state.prompt,
      state.workflow
    );


  state.models =
    extractModels(
      state.prompt,
      state.workflow
    );

}


/* ============================================================
   NODE EXTRACTION
============================================================ */

function extractNodes(
  prompt,
  workflow
) {

  const result = [];


  /*
   * API format
   */

  if (
    isObject(prompt) &&
    !Array.isArray(prompt)
  ) {

    for (
      const [id, node]
      of Object.entries(prompt)
    ) {

      if (
        !isObject(node)
      ) continue;

      if (
        typeof node.class_type !==
        "string"
      ) continue;

      result.push({
        id,

        type:
          node.class_type,

        title:
          node._meta?.title ||
          node._meta?.name ||
          "",

        inputs:
          node.inputs || {},

        source:
          "prompt"
      });

    }

  }


  /*
   * Visual workflow format
   */

  if (
    isObject(workflow) &&
    Array.isArray(workflow.nodes)
  ) {

    for (
      const node
      of workflow.nodes
    ) {

      if (
        !node ||
        typeof node !== "object"
      ) {
        continue;
      }

      const id =
        String(
          node.id ??
          result.length + 1
        );

      const type =
        node.type ||
        node.class_type ||
        "Unknown";

      /*
       * Avoid duplicating API nodes when
       * workflow and prompt contain the
       * same graph.
       */

      const exists =
        result.some(
          (item) =>
            String(item.id) === id &&
            item.type === type
        );

      if (!exists) {

        result.push({
          id,

          type,

          title:
            node.title ||
            node.properties?.["Node name for S&R"] ||
            "",

          inputs:
            node.widgets_values || [],

          source:
            "workflow"
        });

      }

    }

  }


  return result;

}


/* ============================================================
   PROMPT EXTRACTION
============================================================ */

function extractPrompts(
  prompt,
  workflow
) {

  const candidates = [];

  const add =
    (text, nodeType, id) => {

      if (
        typeof text !== "string"
      ) return;

      const cleaned =
        text.trim();

      if (!cleaned) return;

      candidates.push({
        text: cleaned,
        nodeType,
        id
      });

    };


  /*
   * API nodes
   */

  if (
    isObject(prompt)
  ) {

    for (
      const [id, node]
      of Object.entries(prompt)
    ) {

      if (
        !isObject(node)
      ) continue;

      const type =
        String(
          node.class_type || ""
        ).toLowerCase();

      const inputs =
        node.inputs || {};


      if (
        type.includes("cliptextencode") ||
        type.includes("textencode")
      ) {

        add(
          inputs.text,
          node.class_type,
          id
        );

      }

    }

  }


  /*
   * Workflow nodes
   */

  if (
    isObject(workflow) &&
    Array.isArray(workflow.nodes)
  ) {

    for (
      const node
      of workflow.nodes
    ) {

      const type =
        String(
          node.type || ""
        ).toLowerCase();

      const values =
        node.widgets_values;

      if (
        !Array.isArray(values)
      ) continue;

      if (
        type.includes("cliptextencode") ||
        type.includes("textencode")
      ) {

        const text =
          values.find(
            (value) =>
              typeof value === "string" &&
              value.trim().length > 0
          );

        add(
          text,
          node.type,
          node.id
        );

      }

    }

  }


  /*
   * Determine positive/negative.
   *
   * The strongest heuristic is downstream
   * KSampler connection information. If that
   * is unavailable, use node titles / order.
   */

  let positive = "";
  let negative = "";

  for (
    const candidate
    of candidates
  ) {

    const lower =
      candidate.text.toLowerCase();

    if (
      !positive &&
      !looksNegative(
        lower
      )
    ) {

      positive =
        candidate.text;

      continue;

    }

    if (
      !negative &&
      looksNegative(
        lower
      )
    ) {

      negative =
        candidate.text;

    }

  }


  if (
    candidates.length >= 2
  ) {

    if (!positive) {
      positive =
        candidates[0].text;
    }

    if (!negative) {
      negative =
        candidates[1].text;
    }

  }


  return {
    positive,
    negative,
    all: candidates
  };

}


function looksNegative(text) {

  return (
    text.includes("negative") ||
    text.includes("bad quality") ||
    text.includes("worst quality") ||
    text.includes("low quality")
  );

}


/* ============================================================
   MODEL EXTRACTION
============================================================ */

function extractModels(
  prompt,
  workflow
) {

  const models =
    new Set();


  const inspectInputs =
    (inputs) => {

      if (!isObject(inputs)) {
        return;
      }

      for (
        const [key, value]
        of Object.entries(inputs)
      ) {

        if (
          typeof value !== "string"
        ) {
          continue;
        }

        if (
          looksLikeModel(
            key,
            value
          )
        ) {

          models.add(value);

        }

      }

    };


  if (
    isObject(prompt)
  ) {

    for (
      const node
      of Object.values(prompt)
    ) {

      if (
        isObject(node)
      ) {

        inspectInputs(
          node.inputs
        );

      }

    }

  }


  if (
    isObject(workflow) &&
    Array.isArray(workflow.nodes)
  ) {

    for (
      const node
      of workflow.nodes
    ) {

      if (
        isObject(node)
      ) {

        /*
         * Workflow widgets aren't named as
         * reliably as API inputs, but we can
         * still identify filenames.
         */

        const values =
          node.widgets_values;

        if (
          Array.isArray(values)
        ) {

          for (
            const value
            of values
          ) {

            if (
              typeof value === "string" &&
              looksLikeModelValue(value)
            ) {

              models.add(value);

            }

          }

        }

      }

    }

  }


  return [
    ...models
  ];

}


function looksLikeModel(
  key,
  value
) {

  const k =
    key.toLowerCase();

  return (
    k.includes("ckpt") ||
    k.includes("checkpoint") ||
    k.includes("lora") ||
    k.includes("vae") ||
    k.includes("controlnet") ||
    k.includes("model") ||
    looksLikeModelValue(value)
  );

}


function looksLikeModelValue(value) {

  const v =
    value.toLowerCase();

  return (
    v.endsWith(".safetensors") ||
    v.endsWith(".ckpt") ||
    v.endsWith(".pt") ||
    v.endsWith(".pth") ||
    v.endsWith(".bin") ||
    v.endsWith(".gguf") ||
    v.endsWith(".onnx")
  );

}


/* ============================================================
   PARAMETER EXTRACTION
============================================================ */

function extractParameters(
  prompt,
  workflow
) {

  const result = {};


  const set =
    (key, value) => {

      if (
        value === undefined ||
        value === null ||
        value === ""
      ) {
        return;
      }

      if (
        result[key] === undefined
      ) {

        result[key] = value;

      }

    };


  if (
    isObject(prompt)
  ) {

    for (
      const node
      of Object.values(prompt)
    ) {

      if (
        !isObject(node)
      ) continue;

      const type =
        String(
          node.class_type || ""
        ).toLowerCase();

      const inputs =
        node.inputs || {};


      if (
        type.includes("ksampler")
      ) {

        set(
          "Seed",
          inputs.seed
        );

        set(
          "Steps",
          inputs.steps
        );

        set(
          "CFG",
          inputs.cfg
        );

        set(
          "Sampler",
          inputs.sampler_name
        );

        set(
          "Scheduler",
          inputs.scheduler
        );

        set(
          "Denoise",
          inputs.denoise
        );

      }


      if (
        type.includes("emptylatent")
      ) {

        set(
          "Width",
          inputs.width
        );

        set(
          "Height",
          inputs.height
        );

        set(
          "Batch Size",
          inputs.batch_size
        );

      }

    }

  }


  return result;

}


/* ============================================================
   RENDER EVERYTHING
============================================================ */

function renderEverything() {

  renderSummary();

  renderJSON();

  renderNodes();

  renderChunks();

}


/* ============================================================
   SUMMARY
============================================================ */

function renderSummary() {

  positivePrompt.textContent =
    state.prompts.positive ||
    "Not detected";

  negativePrompt.textContent =
    state.prompts.negative ||
    "Not detected";


  if (
    state.models.length
  ) {

    modelSummary.textContent =
      state.models.join(", ");

  } else {

    modelSummary.textContent =
      "Not detected";

  }


  nodeSummary.textContent =
    state.nodes.length
      ? `${state.nodes.length} node${state.nodes.length === 1 ? "" : "s"}`
      : "Not detected";


  renderParameters();

  renderMetadataTable();

}


/* ============================================================
   PARAMETERS
============================================================ */

function renderParameters() {

  parametersGrid.innerHTML = "";

  const entries =
    Object.entries(
      state.parameters
    );

  if (!entries.length) {

    parametersGrid.innerHTML =
      `<div class="parameter">
        <span class="parameter-label">Status</span>
        <span class="parameter-value">No common parameters detected</span>
      </div>`;

    return;
  }


  for (
    const [key, value]
    of entries
  ) {

    const div =
      document.createElement(
        "div"
      );

    div.className =
      "parameter";

    div.innerHTML = `
      <span class="parameter-label">
        ${escapeHTML(key)}
      </span>

      <span class="parameter-value">
        ${escapeHTML(
          formatValue(value)
        )}
      </span>
    `;

    parametersGrid.appendChild(
      div
    );

  }

}


/* ============================================================
   METADATA TABLE
============================================================ */

function renderMetadataTable() {

  metadataTable.innerHTML = "";

  const entries =
    Object.entries(
      state.metadata
    );

  if (!entries.length) {

    metadataTable.innerHTML =
      `<div class="metadata-row">
        <div class="metadata-key">Status</div>
        <div class="metadata-value">
          No textual metadata chunks detected.
        </div>
      </div>`;

    return;
  }


  for (
    const [key, value]
    of entries
  ) {

    const row =
      document.createElement(
        "div"
      );

    row.className =
      "metadata-row";

    row.innerHTML = `
      <div class="metadata-key">
        ${escapeHTML(key)}
      </div>

      <div class="metadata-value">
        ${escapeHTML(
          formatValue(value)
        )}
      </div>
    `;

    metadataTable.appendChild(
      row
    );

  }

}


/* ============================================================
   JSON
============================================================ */

function renderJSON() {

  state.rawPromptText =
    state.prompt
      ? JSON.stringify(
          state.prompt,
          null,
          2
        )
      : "";


  state.rawWorkflowText =
    state.workflow
      ? JSON.stringify(
          state.workflow,
          null,
          2
        )
      : "";


  renderJson(
    promptJson,
    state.rawPromptText,
    promptSearch.value
  );


  renderJson(
    workflowJson,
    state.rawWorkflowText,
    workflowSearch.value
  );

}


function renderJson(
  element,
  text,
  search
) {

  if (!text) {

    element.textContent =
      "No data found.";

    return;

  }


  if (!search) {

    element.textContent =
      text;

    return;

  }


  /*
   * Keep search local and safe.
   *
   * We don't attempt to mutate the JSON
   * structure; instead we show matching
   * lines with surrounding context.
   */

  const lines =
    text.split("\n");

  const needle =
    search.toLowerCase();

  const matches = [];

  for (
    let i = 0;
    i < lines.length;
    i++
  ) {

    if (
      lines[i]
        .toLowerCase()
        .includes(needle)
    ) {

      matches.push(
        `${String(i + 1).padStart(5, " ")}  ${lines[i]}`
      );

    }

  }


  element.textContent =
    matches.length
      ? matches.join("\n")
      : "No matches.";

}


/* ============================================================
   NODES
============================================================ */

function renderNodes() {

  nodesList.innerHTML = "";

  const search =
    nodeSearch.value
      .trim()
      .toLowerCase();


  const filtered =
    state.nodes.filter(
      (node) => {

        if (!search) {
          return true;
        }

        return [
          node.id,
          node.type,
          node.title
        ]
          .join(" ")
          .toLowerCase()
          .includes(search);

      }
    );


  if (!filtered.length) {

    nodesList.innerHTML =
      `<div class="node">
        <div class="node-id">—</div>
        <div class="node-type">No nodes found</div>
        <div class="node-info">
          Try another search or load a workflow containing node data.
        </div>
      </div>`;

    return;
  }


  for (
    const node
    of filtered
  ) {

    const item =
      document.createElement(
        "div"
      );

    item.className =
      "node";

    const inputSummary =
      summarizeInputs(
        node.inputs
      );

    item.innerHTML = `
      <div class="node-id">
        #${escapeHTML(
          String(node.id)
        )}
      </div>

      <div
        class="node-type"
        title="${escapeAttribute(node.type)}"
      >
        ${escapeHTML(node.type)}
      </div>

      <div
        class="node-info"
        title="${escapeAttribute(
          inputSummary
        )}"
      >
        ${escapeHTML(
          node.title ||
          inputSummary ||
          "No additional information"
        )}
      </div>
    `;

    nodesList.appendChild(
      item
    );

  }

}


function summarizeInputs(inputs) {

  if (
    Array.isArray(inputs)
  ) {

    return inputs
      .slice(0, 8)
      .map(
        (value) =>
          formatValue(value)
      )
      .join(" · ");

  }


  if (
    isObject(inputs)
  ) {

    return Object.entries(inputs)
      .slice(0, 8)
      .map(
        ([key, value]) =>
          `${key}: ${formatValue(value)}`
      )
      .join(" · ");

  }


  return "";

}


/* ============================================================
   CHUNKS
============================================================ */

function renderChunks() {

  chunksList.innerHTML = "";

  if (!state.chunks.length) {

    chunksList.innerHTML =
      `<div class="chunk">
        <div class="chunk-content">
          No metadata chunks found.
        </div>
      </div>`;

    return;

  }


  for (
    const chunk
    of state.chunks
  ) {

    const wrapper =
      document.createElement(
        "div"
      );

    wrapper.className =
      "chunk";

    const text =
      decodeChunkPreview(
        chunk
      );


    wrapper.innerHTML = `
      <div class="chunk-header">

        <span class="chunk-type">
          ${escapeHTML(chunk.type)}
        </span>

        <span class="chunk-size">
          ${formatBytes(chunk.length)}
        </span>

      </div>

      <div class="chunk-content">
        ${escapeHTML(text)}
      </div>
    `;


    chunksList.appendChild(
      wrapper
    );

  }

}


function decodeChunkPreview(chunk) {

  if (
    chunk.type === "tEXt"
  ) {

    const parsed =
      parseTEXT(chunk.data);

    if (parsed) {

      return `${parsed.key}\n\n${parsed.text}`;

    }

  }


  if (
    chunk.type === "iTXt"
  ) {

    const parsed =
      parseITXT(chunk.data);

    if (parsed) {

      try {

        const decoded =
          parsed.compressed
            ? "[compressed iTXt data]"
            : utf8Decode(
                parsed.textBytes
              );

        return `${parsed.keyword}\n\n${decoded}`;

      } catch {

        return "[Unable to decode iTXt]";

      }

    }

  }


  return bytesToHex(
    chunk.data,
    4096
  );

}


/* ============================================================
   EXPORTS
============================================================ */

exportPromptBtn.addEventListener(
  "click",
  () => {

    downloadJSON(
      state.prompt,
      makeOutputName(
        "prompt"
      )
    );

  }
);


exportWorkflowBtn.addEventListener(
  "click",
  () => {

    downloadJSON(
      state.workflow,
      makeOutputName(
        "workflow"
      )
    );

  }
);


downloadPromptBtn.addEventListener(
  "click",
  () => {

    downloadJSON(
      state.prompt,
      makeOutputName(
        "prompt"
      )
    );

  }
);


downloadWorkflowBtn.addEventListener(
  "click",
  () => {

    downloadJSON(
      state.workflow,
      makeOutputName(
        "workflow"
      )
    );

  }
);


copyPromptBtn.addEventListener(
  "click",
  async () => {

    if (!state.rawPromptText) {
      return;
    }

    await copyText(
      state.rawPromptText
    );

  }
);


copyWorkflowBtn.addEventListener(
  "click",
  async () => {

    if (!state.rawWorkflowText) {
      return;
    }

    await copyText(
      state.rawWorkflowText
    );

  }
);


function downloadJSON(
  data,
  filename
) {

  if (
    data === null ||
    data === undefined
  ) {

    showToast(
      "No data available"
    );

    return;

  }


  const text =
    JSON.stringify(
      data,
      null,
      2
    );


  const blob =
    new Blob(
      [text],
      {
        type:
          "application/json"
      }
    );


  const url =
    URL.createObjectURL(blob);


  const anchor =
    document.createElement(
      "a"
    );

  anchor.href =
    url;

  anchor.download =
    filename;

  document.body.appendChild(
    anchor
  );

  anchor.click();

  anchor.remove();

  setTimeout(
    () =>
      URL.revokeObjectURL(url),
    1000
  );

}


function makeOutputName(
  suffix
) {

  const base =
    (state.file?.name ||
      "comfyui")
      .replace(
        /\.[^.]+$/,
        ""
      )
      .replace(
        /[^a-z0-9_-]+/gi,
        "_"
      );

  return `${base}_${suffix}.json`;

}


/* ============================================================
   CLIPBOARD
============================================================ */

async function copyText(text) {

  try {

    await navigator.clipboard.writeText(
      text
    );

    showToast(
      "Copied to clipboard"
    );

  } catch {

    /*
     * Fallback for older browsers / local
     * file contexts.
     */

    const textarea =
      document.createElement(
        "textarea"
      );

    textarea.value =
      text;

    textarea.style.position =
      "fixed";

    textarea.style.opacity =
      "0";

    document.body.appendChild(
      textarea
    );

    textarea.select();

    document.execCommand(
      "copy"
    );

    textarea.remove();

    showToast(
      "Copied to clipboard"
    );

  }

}


/* ============================================================
   UI HELPERS
============================================================ */

function showError(message) {

  errorText.textContent =
    message;

  errorBox.classList.remove(
    "hidden"
  );

}


function clearError() {

  errorText.textContent =
    "";

  errorBox.classList.add(
    "hidden"
  );

}


function showToast(message) {

  toast.textContent =
    message;

  toast.classList.add(
    "show"
  );

  clearTimeout(
    showToast.timer
  );

  showToast.timer =
    setTimeout(
      () =>
        toast.classList.remove(
          "show"
        ),
      1800
    );

}


function clearApplication() {

  cleanupObjectUrl();

  state.file = null;
  state.imageInfo = null;
  state.chunks = [];
  state.metadata = {};
  state.prompt = null;
  state.workflow = null;
  state.nodes = [];
  state.parameters = {};
  state.models = [];
  state.rawPromptText = "";
  state.rawWorkflowText = "";

  state.prompts = {
    positive: "",
    negative: ""
  };

  imagePreview.removeAttribute(
    "src"
  );

  largeImage.removeAttribute(
    "src"
  );

  fileInput.value = "";

  fileInfo.classList.add(
    "hidden"
  );

  toolbar.classList.add(
    "hidden"
  );

  content.classList.add(
    "hidden"
  );

  clearError();

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

}


function cleanupObjectUrl() {

  if (state.objectUrl) {

    URL.revokeObjectURL(
      state.objectUrl
    );

    state.objectUrl = null;

  }

}


/* ============================================================
   FORMAT HELPERS
============================================================ */

function formatBytes(bytes) {

  if (
    !Number.isFinite(bytes)
  ) {
    return "—";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 ** 2) {
    return `${(
      bytes / 1024
    ).toFixed(1)} KB`;
  }

  if (bytes < 1024 ** 3) {
    return `${(
      bytes / 1024 ** 2
    ).toFixed(2)} MB`;
  }

  return `${(
    bytes / 1024 ** 3
  ).toFixed(2)} GB`;

}


function formatValue(value) {

  if (
    value === null
  ) {
    return "null";
  }

  if (
    value === undefined
  ) {
    return "undefined";
  }

  if (
    typeof value === "string"
  ) {
    return value;
  }

  if (
    typeof value === "object"
  ) {

    try {

      return JSON.stringify(
        value
      );

    } catch {

      return String(
        value
      );

    }

  }

  return String(value);

}


/* ============================================================
   BINARY HELPERS
============================================================ */

function isPNG(buffer) {

  if (
    buffer.byteLength < 8
  ) {
    return false;
  }

  const bytes =
    new Uint8Array(
      buffer,
      0,
      8
    );

  const signature = [
    137, 80, 78, 71,
    13, 10, 26, 10
  ];

  return signature.every(
    (value, index) =>
      bytes[index] === value
  );

}


function isWebP(buffer) {

  if (
    buffer.byteLength < 12
  ) {
    return false;
  }

  const bytes =
    new Uint8Array(
      buffer,
      0,
      12
    );

  return (
    asciiDecode(
      bytes.slice(0, 4)
    ) === "RIFF" &&
    asciiDecode(
      bytes.slice(8, 12)
    ) === "WEBP"
  );

}


function asciiDecode(bytes) {

  let result = "";

  for (
    const byte
    of bytes
  ) {

    result +=
      String.fromCharCode(
        byte
      );

  }

  return result;

}


function latin1Decode(bytes) {

  let result = "";

  for (
    const byte
    of bytes
  ) {

    result +=
      String.fromCharCode(
        byte
      );

  }

  return result;

}


function utf8Decode(bytes) {

  try {

    return new TextDecoder(
      "utf-8",
      {
        fatal: false
      }
    ).decode(bytes);

  } catch {

    return latin1Decode(
      bytes
    );

  }

}


function bytesToHex(
  bytes,
  limit = 1024
) {

  const count =
    Math.min(
      bytes.length,
      limit
    );

  const parts = [];

  for (
    let i = 0;
    i < count;
    i++
  ) {

    parts.push(
      bytes[i]
        .toString(16)
        .padStart(2, "0")
    );

  }

  let result =
    parts.join(" ");

  if (
    bytes.length > limit
  ) {

    result +=
      ` … (${bytes.length - limit} more bytes)`;

  }

  return result;

}


/* ============================================================
   ZLIB / DEFLATE
============================================================ */

async function inflateZlib(
  bytes
) {

  /*
   * Modern browsers support CompressionStream /
   * DecompressionStream.
   *
   * PNG zTXt/iTXt uses zlib-wrapped DEFLATE.
   */

  if (
    typeof DecompressionStream ===
    "undefined"
  ) {

    throw new Error(
      "This browser does not support compressed PNG metadata decoding. Please use a recent Chrome, Edge, Firefox, or Safari."
    );

  }


  const stream =
    new Blob(
      [bytes]
    ).stream();


  const decompressed =
    stream.pipeThrough(
      new DecompressionStream(
        "deflate"
      )
    );


  const response =
    new Response(
      decompressed
    );


  return new Uint8Array(
    await response.arrayBuffer()
  );

}


/* ============================================================
   JSON HELPERS
============================================================ */

function tryJSON(value) {

  if (
    typeof value !== "string"
  ) {
    return null;
  }

  try {

    return JSON.parse(
      value
    );

  } catch {

    return null;

  }

}


function isObject(value) {

  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );

}


/* ============================================================
   ESCAPING
============================================================ */

function escapeHTML(value) {

  return String(value)
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );

}


function escapeAttribute(value) {

  return escapeHTML(
    value
  );

}


/* ============================================================
   INITIALIZATION
============================================================ */

window.addEventListener(
  "beforeunload",
  cleanupObjectUrl
);


/*
 * Prevent accidental browser navigation when
 * dropping a file outside the drop area.
 */

window.addEventListener(
  "dragover",
  (event) => {
    event.preventDefault();
  }
);


window.addEventListener(
  "drop",
  (event) => {

    if (
      !dropZone.contains(
        event.target
      )
    ) {

      event.preventDefault();

    }

  }
);
