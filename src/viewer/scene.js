import Camera from './camera';
import Grid from './grid';

/**
 * A scene.
 *
 * Every scene has its own list of model instances, and its own camera and viewport.
 *
 * In addition, every scene may have its own AudioContext if enableAudio() is called.
 * If audo is enabled, the AudioContext's listener's location will be updated automatically.
 * Note that due to browser policies, this may be done only after user interaction with the web page.
 */
export default class Scene {
  /**
   * @param {ModelViewer} viewer
   */
  constructor(viewer) {
    let canvas = viewer.canvas;

    /** @member {ModelViewer.viewer.ModelViewer} */
    this.viewer = viewer;
    /** @member {ModelViewer.viewer.Camera} */
    this.camera = new Camera();
    /** @member {Grid} */
    this.grid = new Grid([-100000, -100000], [200000, 200000], [200000, 200000]);

    /** @member {Array<ModelViewData} */
    this.modelViewsData = [];
    /** @member {Map<ModelView, ModelViewData} */
    this.modelViewsDataMap = new Map();

    /** @member {number} */
    this.renderedCells = 0;
    /** @member {number} */
    this.renderedBuckets = 0;
    /** @member {number} */
    this.renderedInstances = 0;
    /** @member {number} */
    this.renderedParticles = 0;

    /** @member {boolean} */
    this.audioEnabled = false;
    /** @member {?AudioContext} */
    this.audioContext = null;

    // Use the whole canvas, and standard perspective projection values.
    this.camera.viewport([0, 0, canvas.width, canvas.height]);
    this.camera.perspective(Math.PI / 4, canvas.width / canvas.height, 8, 10000);
  }

  /**
   * Creates an AudioContext if one wasn't created already, and resumes it if needed.
   * The returned promise will resolve to whether it is actually running or not.
   * It may stay in suspended state indefinitly until the user interacts with the page, due to browser policies.
   *
   * @return {Promise}
   */
  async enableAudio() {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }

    if (this.audioContext.state !== 'suspended') {
      await this.audioContext.resume();
    }

    this.audioEnabled = this.audioContext.state === 'running';

    return this.audioEnabled;
  }

  /**
   * Suspend the audio context.
   */
  disableAudio() {
    if (this.audioContext) {
      this.audioContext.suspend();
    }

    this.audioEnabled = false;
  }

  /**
   * Sets the scene of the given instance.
   * This is equivalent to instance.setScene(scene).
   *
   * @param {ModelInstance} instance
   * @return {boolean}
   */
  addInstance(instance) {
    if (instance.scene !== this) {
      if (instance.scene) {
        instance.scene.removeInstance(instance);
      }

      instance.scene = this;

      // Only allow instances that are actually ok to be added the scene.
      if (instance.model.ok) {
        this.grid.moved(instance);

        this.viewChanged(instance);

        return true;
      }
    }

    return false;
  }

  /**
   * @param {ModelInstance} instance The instance to remove.
   * @return {boolean}
   */
  removeInstance(instance) {
    if (instance.scene === this) {
      this.grid.remove(instance);

      instance.scene = null;
      instance.modelViewData = null;

      return true;
    }

    return false;
  }

  /**
   * Called by Model when an instance changes its view, e.g. by using TexturedModelInstance.setTexture()
   *
   * @param {ModelInstance} instance
   */
  viewChanged(instance) {
    let modelViewsData = this.modelViewsData;
    let modelViewsDataMap = this.modelViewsDataMap;
    let modelView = instance.modelView;

    if (!modelViewsDataMap.has(modelView)) {
      let modelViewData = new instance.model.handler.Data(modelView, this);

      modelViewsData.push(modelViewData);
      modelViewsDataMap.set(modelView, modelViewData);
    }

    instance.modelViewData = modelViewsDataMap.get(modelView);
  }

  /**
   * Clear this scene.
   */
  clear() {
    // First remove references to this scene stored in the instances.
    for (let cell of this.grid.cells) {
      for (let instance of cell.instances) {
        if (instance.scene) {
          instance.scene = null;
          instance.modelViewData = null;
        }
      }
    }

    // Then remove references to the instances.
    this.grid.clear();

    // Finally clear the model views data.
    this.modelViewsData.length = 0;
    this.modelViewsDataMap.clear();
  }

  /**
   * Detach this scene from the viewer.
   * Equivalent to viewer.removeScene(scene).
   *
   * @return {boolean}
   */
  detach() {
    if (this.viewer) {
      return this.viewer.removeScene(this);
    }

    return false;
  }

  /**
   * Update this scene.
   * This includes updating the scene's camera, the node hierarchy (model instances etc.), the rendering data, and the AudioContext's lisener's position if it exists.
   */
  update() {
    let camera = this.camera;

    // Update the camera.
    camera.update();

    // Update the autido context's position if it exists.
    if (this.audioContext) {
      let [x, y, z] = this.camera.location;

      this.audioContext.listener.setPosition(-x, -y, -z);
    }

    // Update all of the visible instances that have no parents.
    // Instances that have parents will be updated down the hierarcy automatically.
    for (let cell of this.grid.cells) {
      if (cell.isVisible(camera)) {
        for (let instance of cell.instances) {
          if (instance.isVisible(camera) && !instance.parent) {
            instance.update(this);
          }
        }
      }
    }

    // Reset all of the buckets.
    for (let modelViewData of this.modelViewsData) {
      modelViewData.startFrame();
    }

    this.renderedCells = 0;
    this.renderedBuckets = 0;
    this.renderedInstances = 0;
    this.renderedParticles = 0;

    // Render all of the visible instances into the buckets.
    for (let cell of this.grid.cells) {
      if (cell.plane === -1) {
        this.renderedCells += 1;

        for (let instance of cell.instances) {
          if (instance.isVisible(camera)) {
            instance.render();
          }
        }
      }
    }

    // Update the bucket buffers.
    for (let modelViewData of this.modelViewsData) {
      modelViewData.updateBuffers();
      modelViewData.updateEmitters();

      this.renderedBuckets += modelViewData.usedBuckets;
      this.renderedInstances += modelViewData.instances;
      this.renderedParticles += modelViewData.particles;
    }
  }

  /**
   * Render all opaque things in this scene.
   * Automatically applies the camera's viewport.
   */
  renderOpaque() {
    this.viewport();

    for (let modelViewData of this.modelViewsData) {
      modelViewData.renderOpaque(this);
    }
  }

  /**
   * Renders all translucent things in this scene.
   * Automatically applies the camera's viewport.
   */
  renderTranslucent() {
    this.viewport();

    for (let modelViewData of this.modelViewsData) {
      modelViewData.renderTranslucent(this);
    }
  }

  /**
   * Set the viewport to that of this scene's camera.
   */
  viewport() {
    let viewport = this.camera.rect;

    this.viewer.gl.viewport(viewport[0], viewport[1], viewport[2], viewport[3]);
  }

  /**
   * Clear all of the emitted objects in this scene.
   */
  clearEmittedObjects() {
    for (let cell of this.grid.cells) {
      for (let instance of cell.instances) {
        instance.clearEmittedObjects();
      }
    }
  }
}
