/*
 * Liminal Asset Previewer
 * -----------------------
 * Mobile-first GLB inspector built on Babylon.js.
 *
 * Important design choice:
 * - The selected GLB is read locally in the browser.
 * - No upload endpoint exists in this tool.
 * - Babylon's current top-level LoadAssetContainerAsync API is used first.
 */
(() => {
  "use strict";

  const els = {};
  let engine = null;
  let scene = null;
  let camera = null;
  let currentContainer = null;
  let gridRoot = null;
  let autoRotate = false;
  let wireframe = false;
  let currentModelMeshes = [];

  function byId(id) {
    return document.getElementById(id);
  }

  function cacheElements() {
    Object.assign(els, {
      canvas: byId("renderCanvas"),
      fileInput: byId("assetFile"),
      frameButton: byId("frameButton"),
      wireframeButton: byId("wireframeButton"),
      gridButton: byId("gridButton"),
      rotateButton: byId("rotateButton"),
      dropZone: byId("dropZone"),
      statusTitle: byId("statusTitle"),
      statusDetail: byId("statusDetail"),
      emptyState: byId("emptyState"),
      loadingOverlay: byId("loadingOverlay"),
      loadingText: byId("loadingText"),
      errorPanel: byId("errorPanel"),
      errorMessage: byId("errorMessage"),
      assetInfo: byId("assetInfo"),
      infoFile: byId("infoFile"),
      infoFileSize: byId("infoFileSize"),
      infoDimensions: byId("infoDimensions"),
      infoMeshes: byId("infoMeshes"),
      infoMaterials: byId("infoMaterials"),
      infoTriangles: byId("infoTriangles"),
    });
  }

  function setStatus(title, detail = "") {
    els.statusTitle.textContent = title;
    els.statusDetail.textContent = detail;
  }

  function setLoading(isLoading, text = "Cargando asset…") {
    els.loadingText.textContent = text;
    els.loadingOverlay.hidden = !isLoading;
  }

  function showError(error) {
    const message = error instanceof Error ? error.message : String(error);
    els.errorMessage.textContent = message;
    els.errorPanel.hidden = false;
    setStatus("Error", message);
    console.error("[Asset Previewer]", error);
  }

  function clearError() {
    els.errorPanel.hidden = true;
    els.errorMessage.textContent = "";
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / (1024 ** power)).toFixed(power === 0 ? 0 : 1)} ${units[power]}`;
  }

  function createGrid(sceneRef) {
    const root = new BABYLON.TransformNode("preview-grid-root", sceneRef);
    root.metadata = { previewerHelper: true };

    const extent = 10;
    const pointsMinor = [];
    const pointsMajor = [];

    for (let i = -extent; i <= extent; i += 1) {
      const target = i % 5 === 0 ? pointsMajor : pointsMinor;
      target.push([new BABYLON.Vector3(i, 0, -extent), new BABYLON.Vector3(i, 0, extent)]);
      target.push([new BABYLON.Vector3(-extent, 0, i), new BABYLON.Vector3(extent, 0, i)]);
    }

    const minor = BABYLON.MeshBuilder.CreateLineSystem(
      "preview-grid-minor",
      { lines: pointsMinor, updatable: false },
      sceneRef,
    );
    minor.color = new BABYLON.Color3(0.20, 0.20, 0.20);
    minor.alpha = 0.55;
    minor.isPickable = false;
    minor.parent = root;
    minor.metadata = { previewerHelper: true };

    const major = BABYLON.MeshBuilder.CreateLineSystem(
      "preview-grid-major",
      { lines: pointsMajor, updatable: false },
      sceneRef,
    );
    major.color = new BABYLON.Color3(0.35, 0.35, 0.35);
    major.alpha = 0.8;
    major.isPickable = false;
    major.parent = root;
    major.metadata = { previewerHelper: true };

    const xAxis = BABYLON.MeshBuilder.CreateLines("preview-axis-x", {
      points: [
        new BABYLON.Vector3(-extent, 0.002, 0),
        new BABYLON.Vector3(extent, 0.002, 0),
      ],
    }, sceneRef);
    xAxis.color = new BABYLON.Color3(0.50, 0.18, 0.18);
    xAxis.isPickable = false;
    xAxis.parent = root;
    xAxis.metadata = { previewerHelper: true };

    const zAxis = BABYLON.MeshBuilder.CreateLines("preview-axis-z", {
      points: [
        new BABYLON.Vector3(0, 0.002, -extent),
        new BABYLON.Vector3(0, 0.002, extent),
      ],
    }, sceneRef);
    zAxis.color = new BABYLON.Color3(0.18, 0.32, 0.55);
    zAxis.isPickable = false;
    zAxis.parent = root;
    zAxis.metadata = { previewerHelper: true };

    return root;
  }

  function setupScene() {
    if (!window.BABYLON) {
      throw new Error("Babylon.js no se ha cargado. Comprueba la conexión y vuelve a abrir la página.");
    }

    engine = new BABYLON.Engine(els.canvas, true, {
      antialias: true,
      preserveDrawingBuffer: false,
      stencil: true,
      adaptToDeviceRatio: true,
    });

    scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.055, 0.055, 0.055, 1);

    camera = new BABYLON.ArcRotateCamera(
      "preview-camera",
      -Math.PI / 2,
      Math.PI / 2.35,
      5,
      BABYLON.Vector3.Zero(),
      scene,
    );

    camera.attachControl(els.canvas, true);
    camera.lowerRadiusLimit = 0.03;
    camera.upperRadiusLimit = 1000;
    camera.wheelPrecision = 45;
    camera.pinchPrecision = 90;
    camera.panningSensibility = 200;
    camera.minZ = 0.001;
    scene.activeCamera = camera;

    const hemi = new BABYLON.HemisphericLight(
      "preview-hemi",
      new BABYLON.Vector3(0, 1, 0),
      scene,
    );
    hemi.intensity = 1.35;

    const key = new BABYLON.DirectionalLight(
      "preview-key",
      new BABYLON.Vector3(-0.5, -1, -0.5),
      scene,
    );
    key.position = new BABYLON.Vector3(6, 10, 6);
    key.intensity = 1.15;

    const fill = new BABYLON.DirectionalLight(
      "preview-fill",
      new BABYLON.Vector3(0.6, -0.5, 0.5),
      scene,
    );
    fill.position = new BABYLON.Vector3(-5, 4, -5);
    fill.intensity = 0.45;

    gridRoot = createGrid(scene);

    scene.onBeforeRenderObservable.add(() => {
      if (autoRotate && currentModelMeshes.length) {
        camera.alpha += engine.getDeltaTime() * 0.00022;
      }
    });

    engine.runRenderLoop(() => scene.render());
    window.addEventListener("resize", () => engine.resize(), { passive: true });
  }

  async function disposeCurrentAsset() {
    currentModelMeshes = [];

    if (currentContainer) {
      currentContainer.removeAllFromScene();
      currentContainer.dispose();
      currentContainer = null;
    }

    els.assetInfo.hidden = true;
    els.frameButton.disabled = true;
    els.wireframeButton.disabled = true;
    els.rotateButton.disabled = true;
  }

  function getRenderableMeshes(container) {
    return container.meshes.filter((mesh) => {
      return mesh
        && typeof mesh.getTotalVertices === "function"
        && mesh.getTotalVertices() > 0;
    });
  }

  function calculateBounds(meshes) {
    let min = new BABYLON.Vector3(Infinity, Infinity, Infinity);
    let max = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity);
    let found = false;

    for (const mesh of meshes) {
      if (!mesh || mesh.isDisposed()) continue;

      mesh.computeWorldMatrix(true);
      const info = mesh.getBoundingInfo();
      if (!info) continue;

      min = BABYLON.Vector3.Minimize(min, info.boundingBox.minimumWorld);
      max = BABYLON.Vector3.Maximize(max, info.boundingBox.maximumWorld);
      found = true;
    }

    return found ? { min, max } : null;
  }

  function frameAsset() {
    const bounds = calculateBounds(currentModelMeshes);
    if (!bounds) return;

    const size = bounds.max.subtract(bounds.min);
    const center = bounds.min.add(bounds.max).scale(0.5);
    const largest = Math.max(size.x, size.y, size.z, 0.01);

    camera.setTarget(center);
    camera.radius = Math.max(largest * 1.8, 0.15);
    camera.lowerRadiusLimit = Math.max(largest * 0.03, 0.003);
    camera.upperRadiusLimit = Math.max(largest * 100, 10);
    camera.minZ = Math.max(largest / 10000, 0.0005);
    camera.maxZ = Math.max(largest * 1000, 1000);

    return size;
  }

  function triangleCount(meshes) {
    return meshes.reduce((total, mesh) => {
      const indices = typeof mesh.getTotalIndices === "function"
        ? mesh.getTotalIndices()
        : 0;

      return total + Math.floor(indices / 3);
    }, 0);
  }

  function applyWireframe() {
    if (!currentContainer) return;

    for (const material of currentContainer.materials) {
      if (material && "wireframe" in material) {
        material.wireframe = wireframe;
      }
    }
  }

  function updateInfo(file, size) {
    els.infoFile.textContent = file.name;
    els.infoFileSize.textContent = formatBytes(file.size);
    els.infoDimensions.textContent = size
      ? `${size.x.toFixed(3)} × ${size.y.toFixed(3)} × ${size.z.toFixed(3)} m`
      : "No disponible";
    els.infoMeshes.textContent = String(currentModelMeshes.length);
    els.infoMaterials.textContent = String(currentContainer?.materials?.length ?? 0);
    els.infoTriangles.textContent = triangleCount(currentModelMeshes).toLocaleString("es-ES");
    els.assetInfo.hidden = false;
  }

  async function loadGlb(file) {
    clearError();

    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".glb")) {
      showError(new Error("Este visor acepta actualmente archivos .glb. Selecciona un GLB válido."));
      return;
    }

    if (file.size === 0) {
      showError(new Error("El archivo está vacío."));
      return;
    }

    setLoading(true, `Cargando ${file.name}…`);
    setStatus("Cargando…", `${file.name} · ${formatBytes(file.size)}`);

    try {
      await disposeCurrentAsset();

      const bytes = new Uint8Array(await file.arrayBuffer());

      if (typeof BABYLON.LoadAssetContainerAsync !== "function") {
        throw new Error("La versión cargada de Babylon.js no expone LoadAssetContainerAsync.");
      }

      currentContainer = await BABYLON.LoadAssetContainerAsync(bytes, scene, {
        pluginExtension: ".glb",
      });

      currentContainer.addAllToScene();

      for (const importedCamera of currentContainer.cameras ?? []) {
        importedCamera.setEnabled(false);
      }

      for (const importedLight of currentContainer.lights ?? []) {
        importedLight.setEnabled(false);
      }

      scene.activeCamera = camera;

      currentModelMeshes = getRenderableMeshes(currentContainer);

      if (!currentModelMeshes.length) {
        throw new Error("El GLB se cargó, pero no contiene geometría renderizable.");
      }

      applyWireframe();
      const dimensions = frameAsset();
      updateInfo(file, dimensions);

      els.emptyState.hidden = true;
      els.frameButton.disabled = false;
      els.wireframeButton.disabled = false;
      els.rotateButton.disabled = false;

      setStatus(
        "Asset cargado",
        `${file.name} · ${currentModelMeshes.length} meshes · ${triangleCount(currentModelMeshes).toLocaleString("es-ES")} triángulos`,
      );
    } catch (error) {
      await disposeCurrentAsset();
      els.emptyState.hidden = false;
      showError(error);
    } finally {
      setLoading(false);
      els.fileInput.value = "";
    }
  }

  function bindUI() {
    els.fileInput.addEventListener("change", (event) => {
      loadGlb(event.target.files?.[0]);
    });

    els.frameButton.addEventListener("click", () => frameAsset());

    els.wireframeButton.addEventListener("click", () => {
      wireframe = !wireframe;
      els.wireframeButton.setAttribute("aria-pressed", String(wireframe));
      applyWireframe();
    });

    els.gridButton.addEventListener("click", () => {
      const visible = !gridRoot.isEnabled();
      gridRoot.setEnabled(visible);
      els.gridButton.setAttribute("aria-pressed", String(visible));
    });

    els.rotateButton.addEventListener("click", () => {
      autoRotate = !autoRotate;
      els.rotateButton.setAttribute("aria-pressed", String(autoRotate));
    });

    let dragDepth = 0;

    window.addEventListener("dragenter", (event) => {
      event.preventDefault();
      dragDepth += 1;
      document.body.classList.add("is-dragging");
    });

    window.addEventListener("dragover", (event) => {
      event.preventDefault();
    });

    window.addEventListener("dragleave", (event) => {
      event.preventDefault();
      dragDepth = Math.max(0, dragDepth - 1);

      if (dragDepth === 0) {
        document.body.classList.remove("is-dragging");
      }
    });

    window.addEventListener("drop", (event) => {
      event.preventDefault();
      dragDepth = 0;
      document.body.classList.remove("is-dragging");

      const file = Array.from(event.dataTransfer?.files ?? [])
        .find((candidate) => candidate.name.toLowerCase().endsWith(".glb"));

      if (file) {
        loadGlb(file);
      } else {
        showError(new Error("Arrastra un archivo .glb válido."));
      }
    });
  }

  function init() {
    cacheElements();
    bindUI();

    try {
      setupScene();
      setStatus(
        "Visor listo",
        "Selecciona un GLB. El archivo se procesa localmente en el navegador.",
      );
    } catch (error) {
      showError(error);
      els.fileInput.disabled = true;
    }
  }

  window.addEventListener("DOMContentLoaded", init, { once: true });
})();
