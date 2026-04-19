const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");

const entityTypeEl = document.getElementById("entityType");
const linkTypeEl = document.getElementById("linkType");
const statusLineEl = document.getElementById("statusLine");
const contextMenuEl = document.getElementById("contextMenu");
const imageViewerModalEl = document.getElementById("imageViewerModal");
const imageViewerImageEl = document.getElementById("imageViewerImage");
const imageViewerCloseEl = document.getElementById("imageViewerClose");
const selectedNodeMetaEl = document.getElementById("selectedNodeMeta");
const nodeInspectorEl = document.getElementById("nodeInspector");
const selectedNodeTypeEl = document.getElementById("selectedNodeType");
const selectedNodeTitleEl = document.getElementById("selectedNodeTitle");
const selectedNodeNotesEl = document.getElementById("selectedNodeNotes");
const selectedNodeScreenshotHintEl = document.getElementById("selectedNodeScreenshotHint");
const selectedNodeScreenshotEl = document.getElementById("selectedNodeScreenshot");
const selectedNodeRemoveScreenshotEl = document.getElementById("selectedNodeRemoveScreenshot");
const selectedNodeXEl = document.getElementById("selectedNodeX");
const selectedNodeYEl = document.getElementById("selectedNodeY");
const MASTER_BOARD_ID = "master";
const screenshotCache = new Map();

const nodeSize = { w: 180, h: 78 };
const screenshotNodeLandscapeSize = { w: 250, h: 210 };
const screenshotNodePortraitSize = { w: 220, h: 300 };
const SNAP_DISTANCE = 14;
const SNAP_GAP = 5;

const colors = {
  person: "#66b2ff",
  evidence: "#c58cff",
  event: "#ffc97b",
  concept: "#79e0a7",
  fact: "#6fe78f",
  theory: "#79a7ff",
  contradiction: "#ff7b9d",
  weak: "#b2c1df"
};

let state = {
  board: {
    _id: MASTER_BOARD_ID,
    entities: [],
    links: []
  },
  camera: {
    x: 0,
    y: 0,
    zoom: 1
  },
  draggingNodeId: null,
  draggingNodeIds: [],
  draggingStartPositions: new Map(),
  panning: false,
  selectionBox: {
    active: false,
    startScreen: { x: 0, y: 0 },
    currentScreen: { x: 0, y: 0 },
    additive: false
  },
  selectedNodeId: null,
  selectedNodeIds: [],
  pointerStart: { x: 0, y: 0 },
  cameraStart: { x: 0, y: 0 },
  connectMode: false,
  connectFrom: null,
  saveTimer: null,
  contextMenu: {
    nodeId: null,
    linkId: null,
    world: { x: 0, y: 0 },
    connectFromId: null
  },
  linkTagRects: [],
  screenshotHitRects: []
};

function setStatus(text) {
  statusLineEl.textContent = text;
}

function updateCanvasCursor() {
  if (state.connectMode) {
    canvas.style.cursor = "crosshair";
    return;
  }

  if (state.draggingNodeId || state.panning) {
    canvas.style.cursor = "grabbing";
    return;
  }

  canvas.style.cursor = "grab";
}

function disableConnectMode(message = "Connect mode disabled") {
  state.connectMode = false;
  state.connectFrom = null;
  state.contextMenu.connectFromId = null;
  updateCanvasCursor();
  setStatus(message);
}

function hideContextMenu() {
  contextMenuEl.classList.add("hidden");
  contextMenuEl.innerHTML = "";
}

function showContextMenu(screenX, screenY, html) {
  contextMenuEl.innerHTML = html;
  contextMenuEl.classList.remove("hidden");

  const maxLeft = canvas.clientWidth - contextMenuEl.offsetWidth - 8;
  const maxTop = canvas.clientHeight - contextMenuEl.offsetHeight - 8;

  contextMenuEl.style.left = `${Math.max(8, Math.min(screenX, maxLeft))}px`;
  contextMenuEl.style.top = `${Math.max(8, Math.min(screenY, maxTop))}px`;
}

function openImageViewer(url) {
  if (!url) {
    closeImageViewer();
    return;
  }

  imageViewerImageEl.src = url;
  imageViewerModalEl.classList.remove("hidden");
}

function closeImageViewer() {
  imageViewerModalEl.classList.add("hidden");
  imageViewerImageEl.src = "";
}

function zoomToNode(node, zoomTarget = 1.5) {
  const size = getNodeSize(node);
  const clampedZoom = Math.max(0.2, Math.min(2.4, zoomTarget));
  const nodeCenterX = node.x + size.w / 2;
  const nodeCenterY = node.y + size.h / 2;

  state.camera.zoom = clampedZoom;
  state.camera.x = canvas.clientWidth / 2 - nodeCenterX * clampedZoom;
  state.camera.y = canvas.clientHeight / 2 - nodeCenterY * clampedZoom;
  draw();
}

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * ratio);
  canvas.height = Math.floor(rect.height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  draw();
}

function screenToWorld(x, y) {
  return {
    x: (x - state.camera.x) / state.camera.zoom,
    y: (y - state.camera.y) / state.camera.zoom
  };
}

function worldToScreen(x, y) {
  return {
    x: x * state.camera.zoom + state.camera.x,
    y: y * state.camera.zoom + state.camera.y
  };
}

function getSelectedNode() {
  if (!state.selectedNodeId) {
    return null;
  }

  return state.board.entities.find(entity => entity.id === state.selectedNodeId) ?? null;
}

function isNodeSelected(nodeId) {
  return state.selectedNodeIds.includes(nodeId);
}

function setSelection(nodeIds, primaryId = null) {
  const uniqueIds = [...new Set(nodeIds)];
  state.selectedNodeIds = uniqueIds;

  if (primaryId && uniqueIds.includes(primaryId)) {
    state.selectedNodeId = primaryId;
  } else {
    state.selectedNodeId = uniqueIds[0] ?? null;
  }

  renderSelectedNodeEditor();
  draw();
}

function clearSelection() {
  state.selectedNodeIds = [];
  state.selectedNodeId = null;
  renderSelectedNodeEditor();
  draw();
}

function toggleNodeSelection(nodeId) {
  if (isNodeSelected(nodeId)) {
    const next = state.selectedNodeIds.filter(id => id !== nodeId);
    setSelection(next, next[0] ?? null);
    return;
  }

  setSelection([...state.selectedNodeIds, nodeId], nodeId);
}

function getSelectionBoxWorldRect() {
  const start = state.selectionBox.startScreen;
  const end = state.selectionBox.currentScreen;
  const worldA = screenToWorld(start.x, start.y);
  const worldB = screenToWorld(end.x, end.y);

  const minX = Math.min(worldA.x, worldB.x);
  const minY = Math.min(worldA.y, worldB.y);
  const maxX = Math.max(worldA.x, worldB.x);
  const maxY = Math.max(worldA.y, worldB.y);

  return {
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY
  };
}

function rectIntersectsNode(rect, node) {
  const size = getNodeSize(node);

  return !(
    node.x + size.w < rect.x ||
    node.x > rect.x + rect.w ||
    node.y + size.h < rect.y ||
    node.y > rect.y + rect.h
  );
}

function getDragSnapOffset(dx, dy) {
  const draggedNodes = state.board.entities.filter(entity => state.draggingStartPositions.has(entity.id));
  const stationaryNodes = state.board.entities.filter(entity => !state.draggingStartPositions.has(entity.id));

  if (draggedNodes.length === 0 || stationaryNodes.length === 0) {
    return { x: 0, y: 0 };
  }

  let bestX = null;
  let bestY = null;

  for (const movedNode of draggedNodes) {
    const start = state.draggingStartPositions.get(movedNode.id);
    if (!start) {
      continue;
    }

    const movedSize = getNodeSize(movedNode);
    const movedRect = {
      left: start.x + dx,
      top: start.y + dy,
      right: start.x + dx + movedSize.w,
      bottom: start.y + dy + movedSize.h
    };
    movedRect.centerX = movedRect.left + movedSize.w / 2;
    movedRect.centerY = movedRect.top + movedSize.h / 2;

    for (const stationaryNode of stationaryNodes) {
      const stationarySize = getNodeSize(stationaryNode);
      const fixedRect = {
        left: stationaryNode.x,
        top: stationaryNode.y,
        right: stationaryNode.x + stationarySize.w,
        bottom: stationaryNode.y + stationarySize.h
      };
      fixedRect.centerX = fixedRect.left + stationarySize.w / 2;
      fixedRect.centerY = fixedRect.top + stationarySize.h / 2;

      const xCandidates = [
        fixedRect.right + SNAP_GAP - movedRect.left,
        fixedRect.left - SNAP_GAP - movedRect.right,
        fixedRect.left - movedRect.left,
        fixedRect.right - movedRect.right,
        fixedRect.centerX - movedRect.centerX
      ];

      const yCandidates = [
        fixedRect.bottom + SNAP_GAP - movedRect.top,
        fixedRect.top - SNAP_GAP - movedRect.bottom,
        fixedRect.top - movedRect.top,
        fixedRect.bottom - movedRect.bottom,
        fixedRect.centerY - movedRect.centerY
      ];

      for (const candidate of xCandidates) {
        if (Math.abs(candidate) > SNAP_DISTANCE) {
          continue;
        }

        if (bestX === null || Math.abs(candidate) < Math.abs(bestX)) {
          bestX = candidate;
        }
      }

      for (const candidate of yCandidates) {
        if (Math.abs(candidate) > SNAP_DISTANCE) {
          continue;
        }

        if (bestY === null || Math.abs(candidate) < Math.abs(bestY)) {
          bestY = candidate;
        }
      }
    }
  }

  return {
    x: bestX ?? 0,
    y: bestY ?? 0
  };
}

function setSelectedNode(nodeId) {
  if (!nodeId) {
    clearSelection();
    return;
  }

  setSelection([nodeId], nodeId);
}

function setNodeEditorEnabled(enabled) {
  selectedNodeTypeEl.disabled = !enabled;
  selectedNodeTitleEl.disabled = !enabled;
  selectedNodeNotesEl.disabled = !enabled;
  selectedNodeRemoveScreenshotEl.disabled = !enabled;
  selectedNodeXEl.disabled = !enabled;
  selectedNodeYEl.disabled = !enabled;
}

function getNodeScreenshotUrl(node) {
  if (!node || !node.metadata) {
    return "";
  }

  return node.metadata.screenshotUrl ?? "";
}

function getNodeSize(node) {
  const render = getNodeRenderData(node);
  return { w: render.width, h: render.height };
}

function getScreenshotOrientation(url) {
  const image = getScreenshotImage(url);

  if (!image || !image.complete || !image.naturalWidth || !image.naturalHeight) {
    return "landscape";
  }

  return image.naturalHeight > image.naturalWidth ? "portrait" : "landscape";
}

function wrapTextLines(text, maxCharsPerLine) {
  const input = String(text ?? "");
  const rawLines = input.split(/\r?\n/);
  const lines = [];

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();

    if (!trimmed) {
      lines.push("");
      continue;
    }

    const words = trimmed.split(/\s+/);
    let current = "";

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;

      if (candidate.length <= maxCharsPerLine) {
        current = candidate;
        continue;
      }

      if (current) {
        lines.push(current);
        current = "";
      }

      if (word.length <= maxCharsPerLine) {
        current = word;
        continue;
      }

      let rest = word;
      while (rest.length > maxCharsPerLine) {
        lines.push(rest.slice(0, maxCharsPerLine));
        rest = rest.slice(maxCharsPerLine);
      }

      current = rest;
    }

    lines.push(current);
  }

  return lines.length > 0 ? lines : [""];
}

function getNodeRenderData(node) {
  const screenshotUrl = getNodeScreenshotUrl(node);
  const hasScreenshot = Boolean(screenshotUrl);
  const orientation = hasScreenshot ? getScreenshotOrientation(screenshotUrl) : "landscape";
  const screenshotSize = orientation === "portrait" ? screenshotNodePortraitSize : screenshotNodeLandscapeSize;
  const width = hasScreenshot ? screenshotSize.w : nodeSize.w;
  const lineHeight = 16;
  const maxCharsPerLine = hasScreenshot ? (orientation === "portrait" ? 20 : 24) : 19;
  const titleLines = wrapTextLines(node.title, maxCharsPerLine);
  const titleTopOffset = 36;

  if (!hasScreenshot) {
    const titleHeight = Math.max(lineHeight, titleLines.length * lineHeight);
    const height = Math.max(nodeSize.h, titleTopOffset + titleHeight + 8);

    return {
      width,
      height,
      hasScreenshot,
      screenshotUrl,
      lineHeight,
      titleLines,
      titleTopOffset
    };
  }

  const titleHeight = Math.max(lineHeight, titleLines.length * lineHeight);
  const frameTopOffset = titleTopOffset + titleHeight + 8;
  const frameHeight = screenshotSize.h - frameTopOffset - 8;
  const height = frameTopOffset + frameHeight + 8;

  return {
    width,
    height,
    hasScreenshot,
    screenshotUrl,
    lineHeight,
    titleLines,
    titleTopOffset,
    orientation,
    frameTopOffset,
    frameHeight
  };
}

function getScreenshotImage(url) {
  if (!url) {
    return null;
  }

  if (screenshotCache.has(url)) {
    return screenshotCache.get(url);
  }

  const image = new Image();
  image.src = url;
  image.addEventListener("load", () => draw());
  screenshotCache.set(url, image);
  return image;
}

function syncSelectedNodePositionFields() {
  const node = getSelectedNode();

  if (!node) {
    return;
  }

  selectedNodeXEl.value = String(node.x);
  selectedNodeYEl.value = String(node.y);
}

function renderSelectedNodeEditor() {
  const node = getSelectedNode();

  if (nodeInspectorEl) {
    nodeInspectorEl.classList.toggle("open", Boolean(node));
  }

  if (!node) {
    selectedNodeMetaEl.textContent = "No node selected";
    selectedNodeTypeEl.value = "person";
    selectedNodeTitleEl.value = "";
    selectedNodeNotesEl.value = "";
    selectedNodeScreenshotEl.src = "";
    selectedNodeScreenshotEl.classList.add("hidden");
    selectedNodeScreenshotHintEl.textContent = "Drag and drop an image onto a node to attach a screenshot.";
    selectedNodeXEl.value = "";
    selectedNodeYEl.value = "";
    setNodeEditorEnabled(false);
    return;
  }

  selectedNodeMetaEl.textContent = `ID: ${node.id}`;
  selectedNodeTypeEl.value = node.type;
  selectedNodeTitleEl.value = node.title;
  selectedNodeNotesEl.value = node.notes ?? "";
  const screenshotUrl = getNodeScreenshotUrl(node);
  if (screenshotUrl) {
    selectedNodeScreenshotEl.src = screenshotUrl;
    selectedNodeScreenshotEl.classList.remove("hidden");
    selectedNodeScreenshotHintEl.textContent = "Screenshot attached. Drop another image on this node to replace it.";
  } else {
    selectedNodeScreenshotEl.src = "";
    selectedNodeScreenshotEl.classList.add("hidden");
    selectedNodeScreenshotHintEl.textContent = "Drag and drop an image onto this node to attach a screenshot.";
  }
  selectedNodeXEl.value = String(node.x);
  selectedNodeYEl.value = String(node.y);
  setNodeEditorEnabled(true);
}

function drawGrid() {
  const step = 70 * state.camera.zoom;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  ctx.save();
  ctx.strokeStyle = "rgba(116, 156, 255, 0.18)";
  ctx.lineWidth = 1;

  const startX = ((state.camera.x % step) + step) % step;
  const startY = ((state.camera.y % step) + step) % step;

  for (let x = startX; x < width; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  for (let y = startY; y < height; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  ctx.restore();
}

function draw() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  ctx.clearRect(0, 0, width, height);
  drawGrid();
  state.linkTagRects = [];
  state.screenshotHitRects = [];

  ctx.save();
  ctx.translate(state.camera.x, state.camera.y);
  ctx.scale(state.camera.zoom, state.camera.zoom);

  const entitiesById = new Map(state.board.entities.map(e => [e.id, e]));

  for (const link of state.board.links) {
    const from = entitiesById.get(link.fromId);
    const to = entitiesById.get(link.toId);

    if (!from || !to) {
      continue;
    }

    const fromSize = getNodeSize(from);
    const toSize = getNodeSize(to);
    const fx = from.x + fromSize.w / 2;
    const fy = from.y + fromSize.h / 2;
    const tx = to.x + toSize.w / 2;
    const ty = to.y + toSize.h / 2;

    ctx.strokeStyle = colors[link.type] || "#8ca0c5";
    ctx.lineWidth = link.type === "weak" ? 1.2 : 2;
    ctx.setLineDash(link.type === "theory" ? [8, 5] : link.type === "weak" ? [4, 4] : []);
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(tx, ty);
    ctx.stroke();

    const mx = (fx + tx) / 2;
    const my = (fy + ty) / 2;

    ctx.setLineDash([]);
    ctx.fillStyle = "#102246";
    ctx.fillRect(mx - 42, my - 12, 84, 18);
    ctx.strokeStyle = "rgba(124, 159, 235, 0.5)";
    ctx.strokeRect(mx - 42, my - 12, 84, 18);
    ctx.fillStyle = "#d9e8ff";
    ctx.font = "12px Trebuchet MS";
    ctx.textAlign = "center";
    ctx.fillText(link.type, mx, my + 1);

    state.linkTagRects.push({
      linkId: link.id,
      x: mx - 42,
      y: my - 12,
      w: 84,
      h: 18,
      centerX: mx,
      centerY: my
    });
  }

  for (const entity of state.board.entities) {
    const render = getNodeRenderData(entity);
    const size = { w: render.width, h: render.height };
    const color = colors[entity.type] || "#8ca0c5";

    ctx.fillStyle = "#12254a";
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.fillRect(entity.x, entity.y, size.w, size.h);
    ctx.strokeRect(entity.x, entity.y, size.w, size.h);

    if (isNodeSelected(entity.id)) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = entity.id === state.selectedNodeId ? 2.5 : 1.7;
      ctx.strokeRect(entity.x - 2, entity.y - 2, size.w + 4, size.h + 4);
    }

    ctx.fillStyle = color;
    ctx.font = "700 12px Trebuchet MS";
    ctx.textAlign = "left";
    ctx.fillText(entity.type.toUpperCase(), entity.x + 8, entity.y + 17);

    ctx.fillStyle = "#eef4ff";
    ctx.font = "600 14px Trebuchet MS";
    for (let i = 0; i < render.titleLines.length; i += 1) {
      const lineY = entity.y + render.titleTopOffset + i * render.lineHeight;
      ctx.fillText(render.titleLines[i], entity.x + 8, lineY);
    }

    ctx.fillStyle = "#9cb0d9";
    ctx.font = "12px Trebuchet MS";
    if (render.hasScreenshot) {
      const image = getScreenshotImage(render.screenshotUrl);
      const frameX = entity.x + 8;
      const frameY = entity.y + render.frameTopOffset;
      const frameW = size.w - 16;
      const frameH = render.frameHeight;

      state.screenshotHitRects.push({
        nodeId: entity.id,
        url: render.screenshotUrl,
        x: frameX,
        y: frameY,
        w: frameW,
        h: frameH
      });

      ctx.fillStyle = "#9cb0d9";
      ctx.fillText("screenshot", entity.x + 8, frameY - 8);

      if (image && image.complete) {
        const ratio = image.naturalWidth / image.naturalHeight;
        let drawW = frameW;
        let drawH = drawW / ratio;

        if (drawH > frameH) {
          drawH = frameH;
          drawW = drawH * ratio;
        }

        const drawX = frameX + (frameW - drawW) / 2;
        const drawY = frameY + (frameH - drawH) / 2;

        ctx.fillStyle = "#0b1733";
        ctx.fillRect(frameX, frameY, frameW, frameH);
        ctx.drawImage(image, drawX, drawY, drawW, drawH);
      } else {
        ctx.fillStyle = "#0b1733";
        ctx.fillRect(frameX, frameY, frameW, frameH);
        ctx.fillStyle = "#9cb0d9";
        ctx.fillText("loading image", frameX + 8, frameY + 18);
      }

      ctx.strokeStyle = "#4a69a8";
      ctx.lineWidth = 1;
      ctx.strokeRect(frameX, frameY, frameW, frameH);
    }
  }

  ctx.restore();

  if (state.selectionBox.active) {
    const start = state.selectionBox.startScreen;
    const end = state.selectionBox.currentScreen;
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const w = Math.abs(end.x - start.x);
    const h = Math.abs(end.y - start.y);

    ctx.save();
    ctx.fillStyle = "rgba(93, 138, 226, 0.2)";
    ctx.strokeStyle = "rgba(154, 194, 255, 0.95)";
    ctx.lineWidth = 1.2;
    ctx.setLineDash([6, 4]);
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }
}

function findEntityAtScreen(x, y) {
  const world = screenToWorld(x, y);

  for (let i = state.board.entities.length - 1; i >= 0; i -= 1) {
    const entity = state.board.entities[i];
    const size = getNodeSize(entity);

    if (
      world.x >= entity.x &&
      world.x <= entity.x + size.w &&
      world.y >= entity.y &&
      world.y <= entity.y + size.h
    ) {
      return entity;
    }
  }

  return null;
}

function findLinkTagAtScreen(x, y) {
  const world = screenToWorld(x, y);

  for (let i = state.linkTagRects.length - 1; i >= 0; i -= 1) {
    const tag = state.linkTagRects[i];

    if (
      world.x >= tag.x &&
      world.x <= tag.x + tag.w &&
      world.y >= tag.y &&
      world.y <= tag.y + tag.h
    ) {
      return tag;
    }
  }

  return null;
}

function findScreenshotAtScreen(x, y) {
  const world = screenToWorld(x, y);

  for (let i = state.screenshotHitRects.length - 1; i >= 0; i -= 1) {
    const hit = state.screenshotHitRects[i];

    if (
      world.x >= hit.x &&
      world.x <= hit.x + hit.w &&
      world.y >= hit.y &&
      world.y <= hit.y + hit.h
    ) {
      return hit;
    }
  }

  return null;
}

function queueSave() {
  if (state.saveTimer) {
    clearTimeout(state.saveTimer);
  }

  state.saveTimer = setTimeout(saveBoard, 220);
}

async function saveBoard() {
  try {
    const response = await fetch(`/api/boards/${MASTER_BOARD_ID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state.board)
    });

    if (!response.ok) {
      throw new Error("Save failed");
    }

    const payload = await response.json();
    state.board = payload;
    renderSelectedNodeEditor();
    setStatus("Saved");
  } catch (error) {
    setStatus(`Save error: ${error.message || "unknown"}`);
  }
}

async function loadBoard() {
  try {
    const response = await fetch(`/api/boards/${MASTER_BOARD_ID}`);

    if (!response.ok) {
      throw new Error("Load failed");
    }

    const payload = await response.json();
    state.board = payload;
    state.selectedNodeId = null;
    renderSelectedNodeEditor();
    setStatus("Loaded master board");
    draw();
  } catch (error) {
    setStatus(`Load error: ${error.message || "unknown"}`);
  }
}

async function uploadScreenshot(file) {
  const form = new FormData();
  form.append("image", file);

  const response = await fetch("/api/upload/image", {
    method: "POST",
    body: form
  });

  if (!response.ok) {
    throw new Error("Image upload failed");
  }

  const payload = await response.json();
  if (!payload.url) {
    throw new Error("Upload response missing URL");
  }

  return payload.url;
}

async function addImageToNodeByPicker(nodeId) {
  const node = state.board.entities.find(entity => entity.id === nodeId);

  if (!node) {
    setStatus("Node not found");
    return;
  }

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";

  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    try {
      setStatus("Uploading screenshot...");
      const url = await uploadScreenshot(file);
      if (!node.metadata) {
        node.metadata = {};
      }
      node.metadata.screenshotUrl = url;
      setSelectedNode(node.id);
      zoomToNode(node, 1.5);
      draw();
      queueSave();
      setStatus("Screenshot attached");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown upload error";
      setStatus(`Upload failed: ${message}`);
    }
  });

  input.click();
}

function addEntity() {
  const world = screenToWorld(canvas.clientWidth / 2, canvas.clientHeight / 2);
  addEntityAt(world.x, world.y);
}

function addEntityAt(worldX, worldY, typeOverride = null) {
  const type = typeOverride ?? entityTypeEl.value;
  const baseSize = nodeSize;

  const created = {
    id: crypto.randomUUID(),
    type,
    title: `${type} node`,
    notes: "",
    x: Math.round(worldX - baseSize.w / 2),
    y: Math.round(worldY - baseSize.h / 2),
    metadata: {}
  };

  state.board.entities.push(created);
  setSelectedNode(created.id);

  setStatus("Node added");
  queueSave();

  return created;
}

function deleteEntity(entityId) {
  const before = state.board.entities.length;
  state.board.entities = state.board.entities.filter(entity => entity.id !== entityId);

  if (state.board.entities.length === before) {
    return;
  }

  state.board.links = state.board.links.filter(link => link.fromId !== entityId && link.toId !== entityId);

  if (state.selectedNodeId === entityId) {
    state.selectedNodeId = null;
    renderSelectedNodeEditor();
  }

  state.selectedNodeIds = state.selectedNodeIds.filter(id => id !== entityId);

  setStatus("Node deleted");
  draw();
  queueSave();
}

function renameEntity(entityId) {
  const node = state.board.entities.find(entity => entity.id === entityId);

  if (!node) {
    return;
  }

  const title = prompt("Rename node", node.title);
  if (title !== null && title.trim()) {
    node.title = title.trim();
    renderSelectedNodeEditor();
    setStatus("Node renamed");
    draw();
    queueSave();
  }
}

function startConnectFromEntity(entityId) {
  const node = state.board.entities.find(entity => entity.id === entityId);

  if (!node) {
    return;
  }

  state.connectMode = true;
  state.connectFrom = node;
  updateCanvasCursor();
  setStatus(`Connect mode: selected ${node.title} as source`);
}

function resetCamera() {
  state.camera = { x: 0, y: 0, zoom: 1 };
  draw();
  setStatus("View reset");
}

function buildBoardMenu() {
  return `
    <p class="context-menu-header">Board</p>
    <button data-action="add-person">Add Person Here</button>
    <button data-action="add-evidence">Add Evidence Here</button>
    <button data-action="add-event">Add Event Here</button>
    <button data-action="add-concept">Add Concept Here</button>
    <button data-action="reset-view">Reset View</button>
  `;
}

function buildNodeMenu(entity) {
  return `
    <p class="context-menu-header">Object: ${entity.title}</p>
    <button data-action="node-add-image">Add Image</button>
    <button data-action="rename-node">Rename Node</button>
    <button data-action="connect-from-node">Start Connection From Here</button>
    <button data-action="delete-node" class="menu-danger">Delete Node</button>
  `;
}

function buildLinkMenu(link) {
  return `
    <p class="context-menu-header">Link: ${link.type}</p>
    <button data-action="link-break" class="menu-danger">Break Link</button>
    <button data-action="link-type-fact">Set Type: Fact</button>
    <button data-action="link-type-theory">Set Type: Theory</button>
    <button data-action="link-type-contradiction">Set Type: Contradiction</button>
    <button data-action="link-type-weak">Set Type: Weak Link</button>
    <button data-action="link-add-person">Create Person From Link</button>
    <button data-action="link-add-evidence">Create Evidence From Link</button>
    <button data-action="link-add-event">Create Event From Link</button>
    <button data-action="link-add-concept">Create Concept From Link</button>
  `;
}

function buildConnectTargetMenu(sourceTitle) {
  return `
    <p class="context-menu-header">Connect From: ${sourceTitle}</p>
    <button data-action="connect-add-person">Create + Link Person</button>
    <button data-action="connect-add-evidence">Create + Link Evidence</button>
    <button data-action="connect-add-event">Create + Link Event</button>
    <button data-action="connect-add-concept">Create + Link Concept</button>
    <button data-action="cancel-connect" class="menu-danger">Cancel Connect</button>
  `;
}

function createLinkedNodeAt(type) {
  if (!state.contextMenu.connectFromId) {
    return;
  }

  const source = state.board.entities.find(entity => entity.id === state.contextMenu.connectFromId);

  if (!source) {
    disableConnectMode("Connect source not found.");
    return;
  }

  const { x, y } = state.contextMenu.world;
  const created = addEntityAt(x, y, type);
  createLink(source, created);
  disableConnectMode("Node created and linked. Drag nodes or re-enable Connect Nodes.");
}

function createNodeFromLink(type) {
  const linkId = state.contextMenu.linkId;

  if (!linkId) {
    return;
  }

  const baseLink = state.board.links.find(link => link.id === linkId);

  if (!baseLink) {
    setStatus("Selected link was not found");
    return;
  }

  const from = state.board.entities.find(entity => entity.id === baseLink.fromId);
  const to = state.board.entities.find(entity => entity.id === baseLink.toId);

  if (!from || !to) {
    setStatus("Link endpoints are missing");
    return;
  }

  const x = (from.x + to.x) / 2 + nodeSize.w * 0.15;
  const y = (from.y + to.y) / 2 + nodeSize.h * 1.2;

  const created = addEntityAt(x, y, type);
  createLink(from, created);
  createLink(created, to);
  setStatus(`Created ${type} and interlinked from ${baseLink.type}`);
}

function updateSelectedLinkType(nextType) {
  const linkId = state.contextMenu.linkId;

  if (!linkId) {
    return;
  }

  const link = state.board.links.find(item => item.id === linkId);

  if (!link) {
    setStatus("Selected link was not found");
    return;
  }

  link.type = nextType;
  link.label = nextType;
  draw();
  queueSave();
  setStatus(`Link type changed to ${nextType}`);
}

function breakSelectedLink() {
  const linkId = state.contextMenu.linkId;

  if (!linkId) {
    return;
  }

  const before = state.board.links.length;
  state.board.links = state.board.links.filter(link => link.id !== linkId);

  if (state.board.links.length === before) {
    setStatus("Selected link was not found");
    return;
  }

  state.contextMenu.linkId = null;
  draw();
  queueSave();
  setStatus("Link broken");
}

contextMenuEl.addEventListener("click", event => {
  const button = event.target.closest("button");

  if (!button) {
    return;
  }

  const action = button.getAttribute("data-action");
  const { x, y } = state.contextMenu.world;
  const nodeId = state.contextMenu.nodeId;

  if (action === "add-person") {
    addEntityAt(x, y, "person");
  }
  if (action === "add-evidence") {
    addEntityAt(x, y, "evidence");
  }
  if (action === "add-event") {
    addEntityAt(x, y, "event");
  }
  if (action === "add-concept") {
    addEntityAt(x, y, "concept");
  }
  if (action === "reset-view") {
    resetCamera();
  }
  if (action === "rename-node" && nodeId) {
    renameEntity(nodeId);
  }
  if (action === "delete-node" && nodeId) {
    deleteEntity(nodeId);
  }
  if (action === "node-add-image" && nodeId) {
    addImageToNodeByPicker(nodeId);
  }
  if (action === "connect-from-node" && nodeId) {
    startConnectFromEntity(nodeId);
  }
  if (action === "connect-add-person") {
    createLinkedNodeAt("person");
  }
  if (action === "connect-add-evidence") {
    createLinkedNodeAt("evidence");
  }
  if (action === "connect-add-event") {
    createLinkedNodeAt("event");
  }
  if (action === "connect-add-concept") {
    createLinkedNodeAt("concept");
  }
  if (action === "cancel-connect") {
    disableConnectMode();
  }
  if (action === "link-add-person") {
    createNodeFromLink("person");
  }
  if (action === "link-add-evidence") {
    createNodeFromLink("evidence");
  }
  if (action === "link-add-event") {
    createNodeFromLink("event");
  }
  if (action === "link-add-concept") {
    createNodeFromLink("concept");
  }
  if (action === "link-type-fact") {
    updateSelectedLinkType("fact");
  }
  if (action === "link-type-theory") {
    updateSelectedLinkType("theory");
  }
  if (action === "link-type-contradiction") {
    updateSelectedLinkType("contradiction");
  }
  if (action === "link-type-weak") {
    updateSelectedLinkType("weak");
  }
  if (action === "link-break") {
    breakSelectedLink();
  }

  hideContextMenu();
});

function createLink(fromEntity, toEntity) {
  const type = linkTypeEl.value;

  if (fromEntity.id === toEntity.id) {
    return;
  }

  const exists = state.board.links.some(
    link => link.fromId === fromEntity.id && link.toId === toEntity.id && link.type === type
  );

  if (exists) {
    setStatus("Link already exists");
    return;
  }

  state.board.links.push({
    id: crypto.randomUUID(),
    fromId: fromEntity.id,
    toId: toEntity.id,
    type,
    label: type
  });

  setStatus(`Link created: ${type}`);
  draw();
  queueSave();
}

canvas.addEventListener("pointerdown", event => {
  hideContextMenu();

  if (event.button === 2) {
    return;
  }

  if (event.button === 1) {
    event.preventDefault();
    state.panning = true;
    state.pointerStart = { x: event.offsetX, y: event.offsetY };
    state.cameraStart = { x: state.camera.x, y: state.camera.y };
    canvas.setPointerCapture(event.pointerId);
    updateCanvasCursor();
    setStatus("Panning view");
    return;
  }

  if (event.button !== 0) {
    return;
  }

  const screenshotHit = findScreenshotAtScreen(event.offsetX, event.offsetY);

  if (screenshotHit) {
    setSelectedNode(screenshotHit.nodeId);
    openImageViewer(screenshotHit.url);
    return;
  }

  const hit = findEntityAtScreen(event.offsetX, event.offsetY);

  if (state.connectMode && hit) {
    if (!state.connectFrom) {
      state.connectFrom = hit;
      setStatus(`Source selected: ${hit.title}`);
      return;
    }

    createLink(state.connectFrom, hit);
    disableConnectMode("Link step complete. Drag nodes or re-enable Connect Nodes.");
    return;
  }

  if (state.connectMode && !hit) {
    if (!state.connectFrom) {
      setStatus("Select a source node first, then click a target node or whitespace.");
      return;
    }

    const world = screenToWorld(event.offsetX, event.offsetY);
    state.contextMenu.world = world;
    state.contextMenu.connectFromId = state.connectFrom.id;
    showContextMenu(event.offsetX, event.offsetY, buildConnectTargetMenu(state.connectFrom.title));
    setStatus("Pick a node type to create and link.");
    return;
  }

  if (hit) {
    if (event.shiftKey) {
      toggleNodeSelection(hit.id);
      return;
    }

    if (!isNodeSelected(hit.id)) {
      setSelection([hit.id], hit.id);
    }

    state.draggingNodeId = hit.id;
    state.draggingNodeIds = [...state.selectedNodeIds];
    state.draggingStartPositions = new Map(
      state.board.entities
        .filter(entity => state.draggingNodeIds.includes(entity.id))
        .map(entity => [entity.id, { x: entity.x, y: entity.y }])
    );
    state.pointerStart = { x: event.offsetX, y: event.offsetY };
    canvas.setPointerCapture(event.pointerId);
    updateCanvasCursor();
    return;
  }

  if (event.altKey) {
    state.panning = true;
    state.pointerStart = { x: event.offsetX, y: event.offsetY };
    state.cameraStart = { x: state.camera.x, y: state.camera.y };
    setStatus("Panning view");
  } else {
    state.selectionBox.active = true;
    state.selectionBox.additive = event.shiftKey;
    state.selectionBox.startScreen = { x: event.offsetX, y: event.offsetY };
    state.selectionBox.currentScreen = { x: event.offsetX, y: event.offsetY };
  }

  canvas.setPointerCapture(event.pointerId);
  updateCanvasCursor();
  draw();
});

canvas.addEventListener("pointermove", event => {
  if (state.draggingNodeId) {
    const dx = (event.offsetX - state.pointerStart.x) / state.camera.zoom;
    const dy = (event.offsetY - state.pointerStart.y) / state.camera.zoom;
    const snapOffset = getDragSnapOffset(dx, dy);

    for (const entity of state.board.entities) {
      const start = state.draggingStartPositions.get(entity.id);
      if (!start) {
        continue;
      }

      entity.x = Math.round(start.x + dx + snapOffset.x);
      entity.y = Math.round(start.y + dy + snapOffset.y);
    }

    syncSelectedNodePositionFields();
    draw();
    queueSave();
    return;
  }

  if (state.selectionBox.active) {
    state.selectionBox.currentScreen = { x: event.offsetX, y: event.offsetY };
    draw();
    return;
  }

  if (state.panning) {
    state.camera.x = state.cameraStart.x + (event.offsetX - state.pointerStart.x);
    state.camera.y = state.cameraStart.y + (event.offsetY - state.pointerStart.y);
    draw();
  }
});

canvas.addEventListener("pointerup", event => {
  if (state.selectionBox.active) {
    const rect = getSelectionBoxWorldRect();
    const isClick = rect.w < 4 / state.camera.zoom && rect.h < 4 / state.camera.zoom;

    if (isClick) {
      if (!state.selectionBox.additive) {
        clearSelection();
      }
    } else {
      const hitIds = state.board.entities
        .filter(entity => rectIntersectsNode(rect, entity))
        .map(entity => entity.id);

      if (state.selectionBox.additive) {
        setSelection([...state.selectedNodeIds, ...hitIds], hitIds[0] ?? state.selectedNodeId);
      } else {
        setSelection(hitIds, hitIds[0] ?? null);
      }

      if (hitIds.length > 0) {
        setStatus(`Selected ${state.selectedNodeIds.length} node(s)`);
      }
    }

    state.selectionBox.active = false;
  }

  state.draggingNodeId = null;
  state.draggingNodeIds = [];
  state.draggingStartPositions = new Map();
  state.panning = false;
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
  updateCanvasCursor();
  draw();
});

canvas.addEventListener("auxclick", event => {
  if (event.button === 1) {
    event.preventDefault();
  }
});

canvas.addEventListener("dblclick", event => {
  const hit = findEntityAtScreen(event.offsetX, event.offsetY);
  if (!hit) {
    return;
  }

  setSelectedNode(hit.id);

  const title = prompt("Rename node", hit.title);
  if (title !== null && title.trim()) {
    hit.title = title.trim();
    draw();
    queueSave();
  }
});

canvas.addEventListener("contextmenu", event => {
  event.preventDefault();
  const hit = findEntityAtScreen(event.offsetX, event.offsetY);
  const world = screenToWorld(event.offsetX, event.offsetY);

  state.contextMenu.world = world;

  if (hit) {
    if (!isNodeSelected(hit.id)) {
      setSelection([hit.id], hit.id);
    } else {
      state.selectedNodeId = hit.id;
      renderSelectedNodeEditor();
      draw();
    }
    state.contextMenu.nodeId = hit.id;
    state.contextMenu.linkId = null;
    state.contextMenu.connectFromId = null;
    showContextMenu(event.offsetX, event.offsetY, buildNodeMenu(hit));
    setStatus(`Object menu: ${hit.title}`);
    return;
  }

  const linkTagHit = findLinkTagAtScreen(event.offsetX, event.offsetY);
  if (linkTagHit) {
    const link = state.board.links.find(item => item.id === linkTagHit.linkId);

    if (link) {
      state.contextMenu.nodeId = null;
      state.contextMenu.linkId = link.id;
      state.contextMenu.connectFromId = null;
      state.contextMenu.world = { x: linkTagHit.centerX, y: linkTagHit.centerY };
      showContextMenu(event.offsetX, event.offsetY, buildLinkMenu(link));
      setStatus(`Link menu: ${link.type}`);
      return;
    }
  }

  if (state.connectMode && state.connectFrom) {
    state.contextMenu.nodeId = null;
    state.contextMenu.linkId = null;
    state.contextMenu.connectFromId = state.connectFrom.id;
    showContextMenu(event.offsetX, event.offsetY, buildConnectTargetMenu(state.connectFrom.title));
    setStatus("Pick a node type to create and link.");
    return;
  }

  state.contextMenu.nodeId = null;
  state.contextMenu.linkId = null;
  state.contextMenu.connectFromId = null;
  showContextMenu(event.offsetX, event.offsetY, buildBoardMenu());
  setStatus("Board menu opened");
});

canvas.addEventListener("wheel", event => {
  event.preventDefault();

  const zoomFactor = event.deltaY < 0 ? 1.08 : 0.92;
  const nextZoom = Math.max(0.2, Math.min(2.4, state.camera.zoom * zoomFactor));

  const mouseWorldBefore = screenToWorld(event.offsetX, event.offsetY);
  state.camera.zoom = nextZoom;
  const mouseWorldAfter = screenToWorld(event.offsetX, event.offsetY);

  state.camera.x += (mouseWorldAfter.x - mouseWorldBefore.x) * state.camera.zoom;
  state.camera.y += (mouseWorldAfter.y - mouseWorldBefore.y) * state.camera.zoom;

  draw();
}, { passive: false });

canvas.addEventListener("dragover", event => {
  event.preventDefault();
});

canvas.addEventListener("drop", async event => {
  event.preventDefault();

  const files = event.dataTransfer?.files;
  if (!files || files.length === 0) {
    return;
  }

  const imageFile = Array.from(files).find(file => file.type.startsWith("image/"));
  if (!imageFile) {
    setStatus("Drop an image file to attach screenshot");
    return;
  }

  const hit = findEntityAtScreen(event.offsetX, event.offsetY);
  const node = hit ?? getSelectedNode();

  if (!node) {
    setStatus("Drop image on a node or select a node first");
    return;
  }

  try {
    setStatus("Uploading screenshot...");
    const url = await uploadScreenshot(imageFile);
    if (!node.metadata) {
      node.metadata = {};
    }
    node.metadata.screenshotUrl = url;
    setSelectedNode(node.id);
    zoomToNode(node, 1.5);
    draw();
    queueSave();
    setStatus("Screenshot attached");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown upload error";
    setStatus(`Upload failed: ${message}`);
  }
});

selectedNodeTypeEl.addEventListener("change", () => {
  const node = getSelectedNode();

  if (!node) {
    return;
  }

  node.type = selectedNodeTypeEl.value;
  draw();
  queueSave();
});

selectedNodeTitleEl.addEventListener("input", () => {
  const node = getSelectedNode();

  if (!node) {
    return;
  }

  node.title = selectedNodeTitleEl.value;
  draw();
  queueSave();
});

selectedNodeNotesEl.addEventListener("input", () => {
  const node = getSelectedNode();

  if (!node) {
    return;
  }

  node.notes = selectedNodeNotesEl.value;
  queueSave();
});

selectedNodeRemoveScreenshotEl.addEventListener("click", () => {
  const node = getSelectedNode();

  if (!node) {
    return;
  }

  if (!node.metadata) {
    node.metadata = {};
  }

  delete node.metadata.screenshotUrl;
  renderSelectedNodeEditor();
  draw();
  queueSave();
  setStatus("Screenshot removed");
});

selectedNodeXEl.addEventListener("change", () => {
  const node = getSelectedNode();

  if (!node) {
    return;
  }

  const nextX = Number(selectedNodeXEl.value);

  if (!Number.isFinite(nextX)) {
    syncSelectedNodePositionFields();
    return;
  }

  node.x = Math.round(nextX);
  draw();
  queueSave();
});

selectedNodeYEl.addEventListener("change", () => {
  const node = getSelectedNode();

  if (!node) {
    return;
  }

  const nextY = Number(selectedNodeYEl.value);

  if (!Number.isFinite(nextY)) {
    syncSelectedNodePositionFields();
    return;
  }

  node.y = Math.round(nextY);
  draw();
  queueSave();
});

window.addEventListener("resize", resizeCanvas);
window.addEventListener("click", hideContextMenu);

imageViewerCloseEl.addEventListener("click", closeImageViewer);
imageViewerModalEl.addEventListener("click", event => {
  if (event.target === imageViewerModalEl) {
    closeImageViewer();
  }
});
window.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    closeImageViewer();
  }
});

resizeCanvas();
updateCanvasCursor();
renderSelectedNodeEditor();
loadBoard();
