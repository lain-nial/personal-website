'use strict';

(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const decisionCanvas = $('#decision-canvas');
  if (!decisionCanvas) return;

  const els = {
    decisionCanvas,
    lossCanvas: $('#loss-canvas'),
    networkSvg: $('#network-svg'),
    w1Matrix: $('#w1-matrix'),
    b1Matrix: $('#b1-matrix'),
    w2Matrix: $('#w2-matrix'),
    b2Matrix: $('#b2-matrix'),
    epoch: $('#epoch-value'),
    loss: $('#loss-value'),
    accuracy: $('#accuracy-value'),
    gradient: $('#gradient-value'),
    probeInput: $('#probe-input'),
    probeOutput: $('#probe-output'),
    lrRange: $('#lr-range'),
    lrValue: $('#lr-value'),
    hiddenSelect: $('#hidden-select'),
    speedSelect: $('#speed-select'),
    trainButton: $('#train-button'),
    stepButton: $('#step-button'),
    resetButton: $('#reset-button'),
    runStatus: $('#run-status'),
    datasetButtons: $$('[data-dataset]')
  };

  const COLORS = {
    paper: [243, 239, 230],
    paperLight: [250, 247, 241],
    ink: [23, 24, 21],
    muted: [112, 107, 97],
    accent: [223, 75, 47],
    teal: [45, 106, 103]
  };
  const WEIGHT_DECAY = 0.00008;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const state = {
    dataset: 'xor',
    hidden: 5,
    learningRate: 0.12,
    speed: 2,
    dataSeed: 31,
    initSeed: 7717,
    points: [],
    w1: [],
    b1: [],
    w2: [],
    b2: 0,
    epochs: 0,
    loss: null,
    accuracy: null,
    gradientNorm: null,
    lossHistory: [],
    training: false,
    converged: false,
    manualResume: false,
    frameHandle: 0,
    lastFrame: 0,
    probe: { x: 0, y: 0, inside: false }
  };

  let paramCells = { w1: [], b1: [], w2: [], b2: null };

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function mixColor(from, to, t) {
    const amount = clamp(t, 0, 1);
    return `rgb(${Math.round(lerp(from[0], to[0], amount))}, ${Math.round(lerp(from[1], to[1], amount))}, ${Math.round(lerp(from[2], to[2], amount))})`;
  }

  function probabilityColor(probability) {
    const distance = Math.abs(probability - 0.5) * 2;
    const target = probability >= 0.5 ? COLORS.accent : COLORS.teal;
    return mixColor(COLORS.paperLight, target, Math.pow(distance, 0.86) * 0.82);
  }

  function activationColor(value, scale = 1) {
    const strength = clamp(Math.abs(value) / scale, 0, 1);
    const target = value >= 0 ? COLORS.accent : COLORS.teal;
    return mixColor(COLORS.paperLight, target, 0.08 + strength * 0.76);
  }

  function weightColor(value) {
    return value >= 0
      ? `rgba(223, 75, 47, ${0.08 + clamp(value, 0, 1) * 0.82})`
      : `rgba(45, 106, 103, ${0.08 + clamp(-value, 0, 1) * 0.82})`;
  }

  function makeRng(seed) {
    let value = seed >>> 0;
    return () => {
      value += 0x6D2B79F5;
      let t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function gaussian(random) {
    const u = Math.max(random(), 1e-9);
    const v = Math.max(random(), 1e-9);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function sigmoid(value) {
    if (value >= 0) {
      const exp = Math.exp(-value);
      return 1 / (1 + exp);
    }
    const exp = Math.exp(value);
    return exp / (1 + exp);
  }

  function createDataset(type, seed) {
    const random = makeRng(seed);
    const points = [];
    const push = (x, y, label) => {
      const clippedX = clamp(x, -0.96, 0.96);
      const clippedY = clamp(y, -0.96, 0.96);
      points.push({ x: clippedX, y: clippedY, label });
    };

    if (type === 'ring') {
      const countPerClass = 82;
      for (let index = 0; index < countPerClass; index += 1) {
        const innerAngle = random() * Math.PI * 2;
        const innerRadius = 0.08 + Math.sqrt(random()) * 0.25;
        push(
          Math.cos(innerAngle) * innerRadius + gaussian(random) * 0.035,
          Math.sin(innerAngle) * innerRadius + gaussian(random) * 0.035,
          0
        );

        const outerAngle = random() * Math.PI * 2;
        const outerRadius = 0.62 + random() * 0.27;
        push(
          Math.cos(outerAngle) * outerRadius + gaussian(random) * 0.045,
          Math.sin(outerAngle) * outerRadius + gaussian(random) * 0.045,
          1
        );
      }
      return points;
    }

    if (type === 'moons') {
      const countPerClass = 84;
      for (let index = 0; index < countPerClass; index += 1) {
        const angle = random() * Math.PI;
        const upperX = Math.cos(angle) * 0.68 - 0.04;
        const upperY = Math.sin(angle) * 0.42 - 0.22;
        push(upperX + gaussian(random) * 0.045, upperY + gaussian(random) * 0.045, 0);

        const lowerX = -Math.cos(angle) * 0.68 + 0.04;
        const lowerY = -Math.sin(angle) * 0.42 + 0.22;
        push(lowerX + gaussian(random) * 0.045, lowerY + gaussian(random) * 0.045, 1);
      }
      return points;
    }

    const centers = [
      { x: -0.56, y: -0.56, label: 0 },
      { x: -0.56, y: 0.56, label: 1 },
      { x: 0.56, y: -0.56, label: 1 },
      { x: 0.56, y: 0.56, label: 0 }
    ];
    const countPerCorner = 34;
    centers.forEach((center) => {
      for (let index = 0; index < countPerCorner; index += 1) {
        push(
          center.x + gaussian(random) * 0.115,
          center.y + gaussian(random) * 0.115,
          center.label
        );
      }
    });
    return points;
  }

  function initializeWeights() {
    const random = makeRng(state.initSeed);
    const hidden = state.hidden;
    const limit1 = 1.15 / Math.sqrt(2);
    const limit2 = 1.15 / Math.sqrt(hidden);

    state.w1 = Array.from({ length: hidden }, () => [
      (random() * 2 - 1) * limit1,
      (random() * 2 - 1) * limit1
    ]);
    state.b1 = Array.from({ length: hidden }, () => (random() * 2 - 1) * 0.08);
    state.w2 = Array.from({ length: hidden }, () => (random() * 2 - 1) * limit2);
    state.b2 = (random() * 2 - 1) * 0.08;
  }

  function forward(x, y) {
    const hiddenValues = new Array(state.hidden);
    let weightedOutput = state.b2;
    for (let index = 0; index < state.hidden; index += 1) {
      const preActivation = state.b1[index] + state.w1[index][0] * x + state.w1[index][1] * y;
      const activation = Math.tanh(preActivation);
      hiddenValues[index] = activation;
      weightedOutput += state.w2[index] * activation;
    }
    return { hidden: hiddenValues, output: sigmoid(weightedOutput) };
  }

  function measureModel() {
    let loss = 0;
    let correct = 0;
    const count = state.points.length;
    state.points.forEach((point) => {
      const probability = clamp(forward(point.x, point.y).output, 1e-7, 1 - 1e-7);
      loss += -(point.label * Math.log(probability) + (1 - point.label) * Math.log(1 - probability));
      if ((probability >= 0.5 ? 1 : 0) === point.label) correct += 1;
    });
    loss /= Math.max(1, count);
    loss += 0.5 * WEIGHT_DECAY * (
      state.w1.flat().reduce((sum, weight) => sum + weight * weight, 0) +
      state.w2.reduce((sum, weight) => sum + weight * weight, 0)
    );
    state.loss = loss;
    state.accuracy = correct / Math.max(1, count);
  }

  function trainEpoch() {
    const count = state.points.length;
    const hidden = state.hidden;
    const gradW1 = Array.from({ length: hidden }, () => [0, 0]);
    const gradB1 = new Array(hidden).fill(0);
    const gradW2 = new Array(hidden).fill(0);
    let gradB2 = 0;
    let loss = 0;
    let correct = 0;
    const hiddenValues = new Array(hidden);

    state.points.forEach((point) => {
      let outputPreActivation = state.b2;
      for (let index = 0; index < hidden; index += 1) {
        const preActivation = state.b1[index] + state.w1[index][0] * point.x + state.w1[index][1] * point.y;
        const activation = Math.tanh(preActivation);
        hiddenValues[index] = activation;
        outputPreActivation += state.w2[index] * activation;
      }

      const probability = clamp(sigmoid(outputPreActivation), 1e-7, 1 - 1e-7);
      loss += -(point.label * Math.log(probability) + (1 - point.label) * Math.log(1 - probability));
      if ((probability >= 0.5 ? 1 : 0) === point.label) correct += 1;

      const deltaOutput = probability - point.label;
      gradB2 += deltaOutput;
      for (let index = 0; index < hidden; index += 1) {
        const activation = hiddenValues[index];
        gradW2[index] += deltaOutput * activation;
        const deltaHidden = deltaOutput * state.w2[index] * (1 - activation * activation);
        gradW1[index][0] += deltaHidden * point.x;
        gradW1[index][1] += deltaHidden * point.y;
        gradB1[index] += deltaHidden;
      }
    });

    const normalization = 1 / Math.max(1, count);
    let gradientSquares = 0;

    for (let index = 0; index < hidden; index += 1) {
      for (let inputIndex = 0; inputIndex < 2; inputIndex += 1) {
        const gradient = gradW1[index][inputIndex] * normalization + WEIGHT_DECAY * state.w1[index][inputIndex];
        gradientSquares += gradient * gradient;
        state.w1[index][inputIndex] -= state.learningRate * gradient;
      }
      const biasGradient = gradB1[index] * normalization;
      gradientSquares += biasGradient * biasGradient;
      state.b1[index] -= state.learningRate * biasGradient;

      const outputGradient = gradW2[index] * normalization + WEIGHT_DECAY * state.w2[index];
      gradientSquares += outputGradient * outputGradient;
      state.w2[index] -= state.learningRate * outputGradient;
    }

    const outputBiasGradient = gradB2 * normalization;
    gradientSquares += outputBiasGradient * outputBiasGradient;
    state.b2 -= state.learningRate * outputBiasGradient;

    loss = loss * normalization + 0.5 * WEIGHT_DECAY * (
      state.w1.flat().reduce((sum, weight) => sum + weight * weight, 0) +
      state.w2.reduce((sum, weight) => sum + weight * weight, 0)
    );

    state.epochs += 1;
    state.loss = loss;
    state.accuracy = correct / Math.max(1, count);
    state.gradientNorm = Math.sqrt(gradientSquares);

    if (!Number.isFinite(loss) || !Number.isFinite(state.gradientNorm) || loss > 12) {
      stopTraining('训练发散 · 请重置', true);
      return;
    }

    state.lossHistory.push({ epoch: state.epochs, loss });
    if (state.lossHistory.length > 1600) {
      state.lossHistory = state.lossHistory.filter((entry, index) => index % 2 === 0 || index === state.lossHistory.length - 1);
    }

    if (!state.manualResume && state.epochs > 80 && state.accuracy >= 0.995 && state.loss < 0.035) {
      state.converged = true;
      stopTraining('已收敛', false, 'done');
    }
  }

  function setCanvasSize(canvas) {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    const context = canvas.getContext('2d');
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.imageSmoothingEnabled = true;
    return { context, width, height };
  }

  function renderDecisionBoundary() {
    const { context, width, height } = setCanvasSize(decisionCanvas);
    context.clearRect(0, 0, width, height);
    const padding = Math.max(10, Math.min(width, height) * 0.028);
    const plotSize = Math.min(width, height) - padding * 2;
    const gridSize = 48;
    const heatCanvas = document.createElement('canvas');
    heatCanvas.width = gridSize;
    heatCanvas.height = gridSize;
    const heatContext = heatCanvas.getContext('2d');

    for (let row = 0; row < gridSize; row += 1) {
      const y = 1 - (row + 0.5) / gridSize * 2;
      for (let column = 0; column < gridSize; column += 1) {
        const x = -1 + (column + 0.5) / gridSize * 2;
        heatContext.fillStyle = probabilityColor(forward(x, y).output);
        heatContext.fillRect(column, row, 1, 1);
      }
    }

    context.drawImage(heatCanvas, padding, padding, plotSize, plotSize);
    context.strokeStyle = 'rgba(23, 24, 21, 0.09)';
    context.lineWidth = 1;
    for (let index = 0; index <= 4; index += 1) {
      const offset = padding + plotSize * index / 4;
      context.beginPath();
      context.moveTo(offset, padding);
      context.lineTo(offset, padding + plotSize);
      context.stroke();
      context.beginPath();
      context.moveTo(padding, offset);
      context.lineTo(padding + plotSize, offset);
      context.stroke();
    }

    context.strokeStyle = 'rgba(23, 24, 21, 0.38)';
    context.strokeRect(padding, padding, plotSize, plotSize);

    const toCanvas = (x, y) => ({
      x: padding + (x + 1) * 0.5 * plotSize,
      y: padding + (1 - y) * 0.5 * plotSize
    });

    state.points.forEach((point) => {
      const canvasPoint = toCanvas(point.x, point.y);
      context.beginPath();
      context.arc(canvasPoint.x, canvasPoint.y, 4.2, 0, Math.PI * 2);
      context.fillStyle = point.label === 1 ? 'rgb(223, 75, 47)' : 'rgb(250, 247, 241)';
      context.fill();
      context.lineWidth = 1.7;
      context.strokeStyle = point.label === 1 ? 'rgb(185, 52, 30)' : 'rgb(45, 106, 103)';
      context.stroke();
    });

    if (state.probe.inside) {
      const probePoint = toCanvas(state.probe.x, state.probe.y);
      context.strokeStyle = 'rgba(23, 24, 21, 0.55)';
      context.lineWidth = 1;
      context.setLineDash([3, 3]);
      context.beginPath();
      context.moveTo(probePoint.x, padding);
      context.lineTo(probePoint.x, padding + plotSize);
      context.moveTo(padding, probePoint.y);
      context.lineTo(padding + plotSize, probePoint.y);
      context.stroke();
      context.setLineDash([]);
      context.beginPath();
      context.arc(probePoint.x, probePoint.y, 7, 0, Math.PI * 2);
      context.strokeStyle = 'rgb(23, 24, 21)';
      context.lineWidth = 1.2;
      context.stroke();
    }

    const accuracyText = state.accuracy == null ? '尚未评估' : `训练准确率 ${(state.accuracy * 100).toFixed(1)}%`;
    decisionCanvas.setAttribute('aria-label', `MLP 二维分类决策图，当前第 ${state.epochs} 个 epoch，${accuracyText}。红色区域预测为类别 1，青色区域预测为类别 0。`);
  }

  function renderLossChart() {
    const { context, width, height } = setCanvasSize(els.lossCanvas);
    context.clearRect(0, 0, width, height);
    const margin = { top: 13, right: 8, bottom: 18, left: 34 };
    const chartWidth = Math.max(1, width - margin.left - margin.right);
    const chartHeight = Math.max(1, height - margin.top - margin.bottom);
    const history = state.lossHistory;

    context.font = '8px "Cascadia Mono", "Roboto Mono", monospace';
    context.fillStyle = 'rgb(167, 161, 150)';
    context.textAlign = 'right';
    context.textBaseline = 'middle';

    if (!history.length) {
      context.strokeStyle = 'rgba(23, 24, 21, 0.12)';
      context.setLineDash([3, 4]);
      context.beginPath();
      context.moveTo(margin.left, margin.top + chartHeight * 0.55);
      context.lineTo(margin.left + chartWidth, margin.top + chartHeight * 0.55);
      context.stroke();
      context.setLineDash([]);
      context.textAlign = 'center';
      context.fillStyle = 'rgb(167, 161, 150)';
      context.fillText('等待训练数据', margin.left + chartWidth / 2, margin.top + chartHeight / 2);
      els.lossCanvas.setAttribute('aria-label', '损失曲线，目前还没有训练数据。');
      return;
    }

    const maxLoss = Math.max(0.1, ...history.map((entry) => entry.loss));
    const maxEpoch = Math.max(1, state.epochs);
    for (let index = 0; index <= 2; index += 1) {
      const value = maxLoss * index / 2;
      const y = margin.top + chartHeight - chartHeight * index / 2;
      context.strokeStyle = 'rgba(23, 24, 21, 0.08)';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(margin.left, y);
      context.lineTo(margin.left + chartWidth, y);
      context.stroke();
      context.fillText(value.toFixed(2), margin.left - 6, y);
    }

    context.textAlign = 'left';
    context.textBaseline = 'bottom';
    context.fillText('0', margin.left, height - 3);
    context.textAlign = 'right';
    context.fillText(`${maxEpoch} epoch`, margin.left + chartWidth, height - 3);

    const points = history.map((entry) => ({
      x: margin.left + entry.epoch / maxEpoch * chartWidth,
      y: margin.top + chartHeight - clamp(entry.loss / maxLoss, 0, 1) * chartHeight
    }));

    const gradient = context.createLinearGradient(0, margin.top, 0, margin.top + chartHeight);
    gradient.addColorStop(0, 'rgba(223, 75, 47, 0.22)');
    gradient.addColorStop(1, 'rgba(223, 75, 47, 0)');
    context.beginPath();
    context.moveTo(points[0].x, margin.top + chartHeight);
    points.forEach((point) => context.lineTo(point.x, point.y));
    context.lineTo(points[points.length - 1].x, margin.top + chartHeight);
    context.closePath();
    context.fillStyle = gradient;
    context.fill();

    context.beginPath();
    points.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    context.strokeStyle = 'rgb(223, 75, 47)';
    context.lineWidth = 1.7;
    context.lineJoin = 'round';
    context.lineCap = 'round';
    context.stroke();

    els.lossCanvas.setAttribute('aria-label', `训练损失曲线，当前 epoch ${state.epochs}，损失 ${state.loss.toFixed(4)}。`);
  }

  function appendSvg(parent, tag, attributes = {}, text = '') {
    const element = document.createElementNS(SVG_NS, tag);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
    if (text) element.textContent = text;
    parent.appendChild(element);
    return element;
  }

  function renderNetwork() {
    const svg = els.networkSvg;
    svg.replaceChildren();
    appendSvg(svg, 'title', { id: 'network-title' }, '2 层 MLP 网络连接图');
    appendSvg(svg, 'desc', { id: 'network-desc' }, '线条表示权重，颜色表示正负；节点亮度表示当前探测输入的激活值。');

    const probe = state.probe.inside ? state.probe : { x: 0, y: 0 };
    const activation = forward(probe.x, probe.y);
    const inputPositions = [
      { x: 72, y: 92 },
      { x: 72, y: 158 }
    ];
    const outputPosition = { x: 392, y: 125 };
    const hiddenPositions = state.hidden === 1
      ? [{ x: 232, y: 125 }]
      : Array.from({ length: state.hidden }, (_, index) => ({
          x: 232,
          y: 48 + index / (state.hidden - 1) * 154
        }));

    const hiddenRadius = state.hidden >= 7 ? 12.5 : 15;
    const maxW1 = Math.max(0.3, ...state.w1.flat().map((value) => Math.abs(value)));
    const maxW2 = Math.max(0.3, ...state.w2.map((value) => Math.abs(value)));

    appendSvg(svg, 'text', { x: 72, y: 31, 'text-anchor': 'middle', class: 'network-layer-label' }, 'INPUT');
    appendSvg(svg, 'text', { x: 232, y: 31, 'text-anchor': 'middle', class: 'network-layer-label' }, 'HIDDEN · TANH');
    appendSvg(svg, 'text', { x: 392, y: 31, 'text-anchor': 'middle', class: 'network-layer-label' }, 'OUTPUT · SIGMOID');

    hiddenPositions.forEach((hiddenPosition, hiddenIndex) => {
      inputPositions.forEach((inputPosition, inputIndex) => {
        const weight = state.w1[hiddenIndex][inputIndex];
        const strength = Math.abs(weight) / maxW1;
        const line = appendSvg(svg, 'line', {
          x1: inputPosition.x,
          y1: inputPosition.y,
          x2: hiddenPosition.x,
          y2: hiddenPosition.y,
          stroke: weight >= 0 ? 'rgb(223, 75, 47)' : 'rgb(45, 106, 103)',
          'stroke-width': 0.45 + strength * 2.9,
          'stroke-opacity': 0.12 + strength * 0.68
        });
        appendSvg(line, 'title', {}, `w1[${hiddenIndex + 1},${inputIndex + 1}] = ${weight.toFixed(4)}`);
      });

      const outputWeight = state.w2[hiddenIndex];
      const outputStrength = Math.abs(outputWeight) / maxW2;
      const line = appendSvg(svg, 'line', {
        x1: hiddenPosition.x,
        y1: hiddenPosition.y,
        x2: outputPosition.x,
        y2: outputPosition.y,
        stroke: outputWeight >= 0 ? 'rgb(223, 75, 47)' : 'rgb(45, 106, 103)',
        'stroke-width': 0.45 + outputStrength * 3.2,
        'stroke-opacity': 0.12 + outputStrength * 0.7
      });
      appendSvg(line, 'title', {}, `w2[${hiddenIndex + 1}] = ${outputWeight.toFixed(4)}`);
    });

    const inputValues = [probe.x, probe.y];
    inputPositions.forEach((position, index) => {
      const node = appendSvg(svg, 'circle', {
        cx: position.x,
        cy: position.y,
        r: 19,
        fill: activationColor(inputValues[index], 1),
        stroke: 'rgba(23, 24, 21, 0.48)',
        'stroke-width': 1
      });
      appendSvg(node, 'title', {}, `输入 x${index + 1} = ${inputValues[index].toFixed(3)}`);
      appendSvg(svg, 'text', { x: position.x, y: position.y + 3, 'text-anchor': 'middle', class: 'network-node-label' }, `x${index + 1}`);
    });

    hiddenPositions.forEach((position, index) => {
      const value = activation.hidden[index];
      const node = appendSvg(svg, 'circle', {
        cx: position.x,
        cy: position.y,
        r: hiddenRadius,
        fill: activationColor(value, 1),
        stroke: 'rgba(23, 24, 21, 0.42)',
        'stroke-width': 0.9
      });
      appendSvg(node, 'title', {}, `隐藏神经元 ${index + 1}: tanh = ${value.toFixed(4)}`);
      appendSvg(svg, 'text', {
        x: position.x,
        y: position.y + 2.5,
        'text-anchor': 'middle',
        class: state.hidden >= 7 ? 'network-node-label is-small' : 'network-node-label'
      }, String(index + 1));
    });

    const outputNode = appendSvg(svg, 'circle', {
      cx: outputPosition.x,
      cy: outputPosition.y,
      r: 21,
      fill: activationColor(activation.output, 1),
      stroke: 'rgba(23, 24, 21, 0.5)',
      'stroke-width': 1.1
    });
    appendSvg(outputNode, 'title', {}, `输出概率 = ${activation.output.toFixed(4)}`);
    appendSvg(svg, 'text', { x: outputPosition.x, y: outputPosition.y + 3, 'text-anchor': 'middle', class: 'network-node-label' }, 'ŷ');
  }

  function createParamCell(label, extraClass = '') {
    const cell = document.createElement('div');
    cell.className = `param-cell ${extraClass}`.trim();
    const name = document.createElement('span');
    name.textContent = label;
    const value = document.createElement('b');
    value.textContent = '0.00';
    cell.append(name, value);
    cell._valueElement = value;
    cell._label = label;
    return cell;
  }

  function buildParameterCells() {
    els.w1Matrix.replaceChildren();
    els.b1Matrix.replaceChildren();
    els.w2Matrix.replaceChildren();
    els.b2Matrix.replaceChildren();
    paramCells = { w1: [], b1: [], w2: [], b2: null };

    for (let hiddenIndex = 0; hiddenIndex < state.hidden; hiddenIndex += 1) {
      for (let inputIndex = 0; inputIndex < 2; inputIndex += 1) {
        const cell = createParamCell(`h${hiddenIndex + 1}·x${inputIndex + 1}`);
        els.w1Matrix.appendChild(cell);
        paramCells.w1.push({ cell, hiddenIndex, inputIndex });
      }
    }

    for (let index = 0; index < state.hidden; index += 1) {
      const cell = createParamCell(`b${index + 1}`, 'is-bias');
      els.b1Matrix.appendChild(cell);
      paramCells.b1.push({ cell, index });
    }

    for (let index = 0; index < state.hidden; index += 1) {
      const cell = createParamCell(`w${index + 1}`, 'is-bias');
      els.w2Matrix.appendChild(cell);
      paramCells.w2.push({ cell, index });
    }

    const outputBiasCell = createParamCell('b²', 'is-bias');
    els.b2Matrix.appendChild(outputBiasCell);
    paramCells.b2 = outputBiasCell;
    els.w2Matrix.style.setProperty('--hidden-count', state.hidden);
  }

  function formatSigned(value) {
    if (Math.abs(value) < 0.005) return '0.00';
    return `${value > 0 ? '+' : ''}${value.toFixed(2)}`;
  }

  function updateParamCell(cell, value, scale, fullName) {
    const normalized = clamp(Math.abs(value) / Math.max(0.001, scale), 0, 1);
    cell.style.background = weightColor(value > 0 ? normalized : -normalized);
    cell._valueElement.textContent = formatSigned(value);
    cell.title = `${fullName} = ${value.toFixed(5)}`;
    cell.setAttribute('aria-label', `${fullName}，${value.toFixed(5)}`);
  }

  function renderParameters() {
    const w1Scale = Math.max(0.25, ...state.w1.flat().map((value) => Math.abs(value)));
    const b1Scale = Math.max(0.18, ...state.b1.map((value) => Math.abs(value)));
    const w2Scale = Math.max(0.25, ...state.w2.map((value) => Math.abs(value)));
    const b2Scale = Math.max(0.18, Math.abs(state.b2));

    paramCells.w1.forEach(({ cell, hiddenIndex, inputIndex }) => {
      updateParamCell(cell, state.w1[hiddenIndex][inputIndex], w1Scale, `W1[${hiddenIndex + 1},${inputIndex + 1}]`);
    });
    paramCells.b1.forEach(({ cell, index }) => {
      updateParamCell(cell, state.b1[index], b1Scale, `b1[${index + 1}]`);
    });
    paramCells.w2.forEach(({ cell, index }) => {
      updateParamCell(cell, state.w2[index], w2Scale, `W2[${index + 1}]`);
    });
    updateParamCell(paramCells.b2, state.b2, b2Scale, 'b2');
  }

  function renderMetrics() {
    els.epoch.textContent = state.epochs.toLocaleString('zh-CN');
    els.loss.textContent = state.loss == null ? '—' : state.loss.toFixed(4);
    els.accuracy.textContent = state.accuracy == null ? '—' : `${(state.accuracy * 100).toFixed(1)}%`;
    els.gradient.textContent = state.gradientNorm == null ? '—' : state.gradientNorm.toFixed(3);
  }

  function renderProbe() {
    const probe = state.probe.inside ? state.probe : { x: 0, y: 0 };
    const output = forward(probe.x, probe.y).output;
    els.probeInput.textContent = `x = (${probe.x.toFixed(2)}, ${probe.y.toFixed(2)})`;
    els.probeOutput.textContent = `ŷ = ${output.toFixed(3)}`;
  }

  function renderAll() {
    renderDecisionBoundary();
    renderLossChart();
    renderNetwork();
    renderParameters();
    renderMetrics();
    renderProbe();
  }

  function setRunStatus(text, mode = '') {
    els.runStatus.textContent = text;
    els.runStatus.classList.toggle('is-running', mode === 'running');
    els.runStatus.classList.toggle('is-done', mode === 'done');
  }

  function updateTrainButton() {
    els.trainButton.textContent = state.training ? '暂停训练' : (state.epochs > 0 ? '继续训练' : '开始训练');
    els.stepButton.disabled = state.training;
    els.resetButton.disabled = state.training;
  }

  function animate(timestamp) {
    if (!state.training) return;
    if (!state.lastFrame) state.lastFrame = timestamp;
    if (timestamp - state.lastFrame >= 20) {
      const steps = Number(state.speed) || 1;
      for (let index = 0; index < steps && state.training; index += 1) {
        trainEpoch();
      }
      state.lastFrame = timestamp;
      renderAll();
    }
    if (state.training) state.frameHandle = requestAnimationFrame(animate);
  }

  function startTraining() {
    if (state.training) return;
    if (state.converged) state.manualResume = true;
    state.converged = false;
    state.training = true;
    state.lastFrame = 0;
    setRunStatus('训练中', 'running');
    updateTrainButton();
    cancelAnimationFrame(state.frameHandle);
    state.frameHandle = requestAnimationFrame(animate);
  }

  function stopTraining(statusText = '已暂停', isError = false, mode = '') {
    state.training = false;
    cancelAnimationFrame(state.frameHandle);
    if (isError) state.converged = true;
    setRunStatus(statusText, mode);
    updateTrainButton();
    renderAll();
  }

  function toggleTraining() {
    if (state.training) stopTraining('已暂停');
    else startTraining();
  }

  function resetNetwork() {
    state.training = false;
    cancelAnimationFrame(state.frameHandle);
    state.initSeed = (state.initSeed * 1664525 + 1013904223) >>> 0;
    state.epochs = 0;
    state.lossHistory = [];
    state.gradientNorm = null;
    state.converged = false;
    state.manualResume = false;
    state.probe = { x: 0, y: 0, inside: false };
    initializeWeights();
    measureModel();
    setRunStatus('等待训练');
    updateTrainButton();
    renderAll();
  }

  function setDataset(dataset) {
    const changed = dataset !== state.dataset;
    state.dataset = dataset;
    if (changed) state.dataSeed += 17;
    else state.dataSeed += 1;
    state.points = createDataset(dataset, state.dataSeed);
    els.datasetButtons.forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.dataset === dataset));
    });
    resetNetwork();
  }

  function updateProbeFromPointer(event) {
    const rect = decisionCanvas.getBoundingClientRect();
    const padding = Math.max(10, Math.min(rect.width, rect.height) * 0.028);
    const plotSize = Math.min(rect.width, rect.height) - padding * 2;
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const inside = localX >= padding && localX <= padding + plotSize && localY >= padding && localY <= padding + plotSize;
    if (!inside) {
      state.probe = { x: 0, y: 0, inside: false };
    } else {
      state.probe = {
        x: clamp((localX - padding) / plotSize * 2 - 1, -1, 1),
        y: clamp(1 - (localY - padding) / plotSize * 2, -1, 1),
        inside: true
      };
    }
    renderDecisionBoundary();
    renderNetwork();
    renderProbe();
  }

  els.trainButton.addEventListener('click', toggleTraining);
  els.stepButton.addEventListener('click', () => {
    if (state.training) return;
    if (state.converged) state.manualResume = true;
    trainEpoch();
    if (state.training === false && !state.converged) setRunStatus('单步完成');
    renderAll();
  });
  els.resetButton.addEventListener('click', resetNetwork);

  els.lrRange.addEventListener('input', () => {
    state.learningRate = Number(els.lrRange.value);
    els.lrValue.textContent = state.learningRate.toFixed(2);
  });

  els.hiddenSelect.addEventListener('change', () => {
    state.hidden = Number(els.hiddenSelect.value);
    buildParameterCells();
    resetNetwork();
  });

  els.speedSelect.addEventListener('change', () => {
    state.speed = Number(els.speedSelect.value);
  });

  els.datasetButtons.forEach((button) => {
    button.addEventListener('click', () => setDataset(button.dataset.dataset));
  });

  decisionCanvas.addEventListener('pointermove', updateProbeFromPointer);
  decisionCanvas.addEventListener('pointerdown', updateProbeFromPointer);
  decisionCanvas.addEventListener('pointerleave', () => {
    state.probe = { x: 0, y: 0, inside: false };
    renderDecisionBoundary();
    renderNetwork();
    renderProbe();
  });

  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(() => renderAll());
    observer.observe(decisionCanvas);
    observer.observe(els.lossCanvas);
  } else {
    window.addEventListener('resize', renderAll);
  }

  state.points = createDataset(state.dataset, state.dataSeed);
  buildParameterCells();
  resetNetwork();
})();