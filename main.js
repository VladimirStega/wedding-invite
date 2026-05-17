let THREE;

const weddingDate = new Date("2026-08-15T15:30:00+03:00");
const countdown = document.querySelector("#countdown");
const countdownPanel = document.querySelector(".countdown");
const story = document.querySelector("#story");
const siteBackground = document.querySelector(".site-background");
const intro = document.querySelector(".intro");
const introText = document.querySelector(".intro__text");
const portalFinale = document.querySelector("#portalFinale");
const cards = [...document.querySelectorAll(".story-card")];
const canvas = document.querySelector("#threeScene");
const webglNote = document.querySelector("#webglNote");
const assetUrls = window.WEDDING_ASSETS || {};

let storyProgress = 0;
let stepPosition = 0;
let finaleProgress = 0;
let archProgress = 0;
let passProgress = 0;
let stableViewportHeight = window.innerHeight;
let stableViewportWidth = window.innerWidth;
let introTargetProgress = 0;
let introRenderProgress = 0;
let sceneRunning = false;
let mobileSnapReady = false;
let snapInProgress = false;
let snapTimer = 0;
let snapAnimation = 0;
let mobileVirtualScroll = 0;
let mobileVirtualReady = false;
let touchStartY = 0;
let touchCurrentY = 0;
let touchStartScroll = 0;
let touchActive = false;
let countdownDocked = false;
let mobileSnapIndex = 0;
const snapCooldown = 900;
let lastSnapCompletedAt = -snapCooldown;

function pad(value) {
  return String(value).padStart(2, "0");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function updateCountdown() {
  const diff = Math.max(0, weddingDate.getTime() - Date.now());
  const totalSeconds = Math.floor(diff / 1000);
  const weeks = Math.floor(totalSeconds / (7 * 24 * 60 * 60));
  const days = Math.floor((totalSeconds / (24 * 60 * 60)) % 7);
  const hours = Math.floor((totalSeconds / (60 * 60)) % 24);
  const minutes = Math.floor((totalSeconds / 60) % 60);
  const seconds = totalSeconds % 60;
  const values = [weeks, days, hours, minutes, seconds];

  countdown.querySelectorAll("strong").forEach((node, index) => {
    node.textContent = index === 0 ? values[index] : pad(values[index]);
  });
}

function smoothWindow(value) {
  return clamp(1 - Math.abs(value) * 1.55, 0, 1);
}

function smoothStep(value) {
  const next = clamp(value, 0, 1);
  return next * next * (3 - 2 * next);
}

function snapEase(value) {
  return clamp(value, 0, 1);
}

function mix(start, end, progress) {
  return start + (end - start) * clamp(progress, 0, 1);
}

function setCountdownDocked(nextDocked) {
  const targetParent = nextDocked ? document.body : introText;
  if (countdownDocked === nextDocked && countdownPanel.parentElement === targetParent) {
    return;
  }

  countdownDocked = nextDocked;
  countdownPanel.classList.toggle("countdown--docked", nextDocked);

  targetParent.appendChild(countdownPanel);
}

function rangeProgress(value, start, end) {
  return clamp((value - start) / Math.max(0.001, end - start), 0, 1);
}

function getStableViewportHeight(mobile) {
  if (!mobile) {
    stableViewportHeight = window.innerHeight;
    stableViewportWidth = window.innerWidth;
    return stableViewportHeight;
  }

  if (Math.abs(window.innerWidth - stableViewportWidth) > 24) {
    stableViewportHeight = window.innerHeight;
    stableViewportWidth = window.innerWidth;
  }

  return stableViewportHeight;
}

function holdFrameProgress(value, hold = 0.34) {
  const frame = Math.floor(value);
  const local = value - frame;
  const eased = local < 0.5
    ? 0.5 * Math.pow(local * 2, 1 + hold)
    : 1 - 0.5 * Math.pow((1 - local) * 2, 1 + hold);
  return frame + eased;
}

function slowNearCenter(value, radius = 0.42, strength = 0.34) {
  const distance = Math.abs(value);
  if (distance <= radius) {
    return value * strength;
  }

  return Math.sign(value) * (radius * strength + (distance - radius));
}

function cardOpacity(localTravel) {
  const fadeIn = smoothStep(rangeProgress(localTravel, -1.05, -0.25));
  const fadeOut = 1 - smoothStep(rangeProgress(localTravel, 0.48, 0.92));
  return clamp(Math.min(fadeIn, fadeOut), 0, 1);
}

function isMobileLayout() {
  return window.matchMedia("(max-width: 860px)").matches;
}

function getSnapPoints() {
  const mobile = isMobileLayout();
  const viewportHeight = getStableViewportHeight(mobile);
  const scrollable = Math.max(1, story.offsetHeight - viewportHeight);
  const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const cardsEnd = mobile ? 0.78 : 0.74;
  const finalStart = mobile ? 0.94 : 0.91;
  const finalSnap = mobile ? 0.995 : finalStart;
  const cardGap = mobile ? 1.25 : 2.8;
  const frameOffset = 0.82;
  const cardTravelLength = (cards.length - 1) * cardGap + frameOffset + 1.05;
  const storyTop = story.offsetTop;
  const points = [0];

  cards.forEach((_, index) => {
    const cardTravel = index * cardGap + frameOffset;
    const cardProgress = clamp(cardTravel / cardTravelLength, 0, 1);
    points.push(storyTop + cardsEnd * scrollable * cardProgress);
  });

  points.push(storyTop + finalSnap * scrollable);

  return [...new Set(points
    .map((point) => Math.round(clamp(point, 0, maxScroll)))
    .sort((a, b) => a - b))];
}

function getNearestSnapIndex(points, scrollY = window.scrollY) {
  let nearestIndex = 0;
  let nearestDistance = Infinity;

  points.forEach((point, index) => {
    const distance = Math.abs(point - scrollY);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  return nearestIndex;
}

function snapToIndex(index) {
  if (!isMobileLayout()) {
    return;
  }

  const points = getSnapPoints();
  const targetIndex = clamp(index, 0, points.length - 1);
  mobileSnapIndex = targetIndex;
  const top = points[targetIndex];
  const startTop = mobileVirtualScroll;
  const distance = top - startTop;
  const duration = 1600;
  const startedAt = performance.now();
  lastSnapCompletedAt = startedAt;

  if (Math.abs(distance) < 2) {
    snapInProgress = false;
    mobileVirtualScroll = top;
    updateStory();
    return;
  }

  snapInProgress = true;
  window.cancelAnimationFrame(snapAnimation);
  window.clearTimeout(snapTimer);

  const animateSnap = (now) => {
    const progress = clamp((now - startedAt) / duration, 0, 1);
    const eased = snapEase(progress);
    mobileVirtualScroll = startTop + distance * eased;
    updateStory();

    if (progress < 1) {
      snapAnimation = window.requestAnimationFrame(animateSnap);
      return;
    }

    mobileVirtualScroll = top;
    updateStory();
    snapInProgress = false;
    lastSnapCompletedAt = performance.now();
  };

  snapAnimation = window.requestAnimationFrame(animateSnap);
}

function snapByDirection(direction) {
  if (snapInProgress || performance.now() - lastSnapCompletedAt < snapCooldown) {
    return;
  }

  const points = getSnapPoints();
  mobileSnapIndex = clamp(mobileSnapIndex, 0, points.length - 1);
  const targetIndex = direction > 0 ? mobileSnapIndex + 1 : mobileSnapIndex - 1;
  snapToIndex(targetIndex);
}

function settleToNearestSnap() {
  if (!isMobileLayout() || snapInProgress || touchActive) {
    return;
  }

  const points = getSnapPoints();
  const nearestIndex = getNearestSnapIndex(points, mobileVirtualScroll);
  mobileSnapIndex = nearestIndex;
  snapToIndex(nearestIndex);
}

function scheduleSnapSettle() {
  if (!isMobileLayout() || snapInProgress || touchActive) {
    return;
  }

  window.clearTimeout(snapTimer);
  snapTimer = window.setTimeout(settleToNearestSnap, 180);
}

function canScrollCard(target, deltaY) {
  const card = target.closest?.(".story-card");
  if (!card) {
    return false;
  }

  const overflowY = window.getComputedStyle(card).overflowY;
  if (!["auto", "scroll"].includes(overflowY) || card.scrollHeight <= card.clientHeight + 1) {
    return false;
  }

  if (deltaY > 0) {
    return card.scrollTop + card.clientHeight < card.scrollHeight - 1;
  }

  return card.scrollTop > 1;
}

function initMobileSnap() {
  if (mobileSnapReady) {
    return;
  }

  mobileSnapReady = true;

  window.addEventListener("wheel", (event) => {
    if (!isMobileLayout() || Math.abs(event.deltaY) < 8) {
      return;
    }

    event.preventDefault();
    if (!snapInProgress && performance.now() - lastSnapCompletedAt >= snapCooldown) {
      snapByDirection(Math.sign(event.deltaY));
    }
  }, { passive: false });

  window.addEventListener("touchstart", (event) => {
    if (!isMobileLayout() || snapInProgress || event.touches.length !== 1) {
      touchActive = false;
      return;
    }

    touchActive = true;
    touchStartY = event.touches[0].clientY;
    touchCurrentY = touchStartY;
    touchStartScroll = mobileVirtualScroll;
  }, { passive: true });

  window.addEventListener("touchmove", (event) => {
    if (!isMobileLayout() || event.touches.length !== 1) {
      return;
    }

    if (snapInProgress) {
      event.preventDefault();
      return;
    }

    if (!touchActive) {
      return;
    }

    const nextY = event.touches[0].clientY;
    const deltaY = touchCurrentY - nextY;
    touchCurrentY = nextY;

    if (!canScrollCard(event.target, deltaY)) {
      event.preventDefault();
    }
  }, { passive: false });

  window.addEventListener("touchend", (event) => {
    if (!isMobileLayout() || snapInProgress || !touchActive) {
      touchActive = false;
      return;
    }

    const endY = event.changedTouches[0]?.clientY ?? touchStartY;
    const touchDelta = touchStartY - endY;
    const scrollDelta = mobileVirtualScroll - touchStartScroll;
    const directionSource = Math.abs(touchDelta) > Math.abs(scrollDelta) ? touchDelta : scrollDelta;
    touchActive = false;

    if (Math.abs(directionSource) > 18) {
      snapByDirection(Math.sign(directionSource));
    } else {
      settleToNearestSnap();
    }
  }, { passive: true });

  window.addEventListener("touchcancel", () => {
    touchActive = false;
  }, { passive: true });
}

function updateStory() {
  const mobile = window.matchMedia("(max-width: 860px)").matches;
  const viewportHeight = getStableViewportHeight(mobile);
  const scrollable = Math.max(1, story.offsetHeight - viewportHeight);
  const cardsEnd = mobile ? 0.78 : 0.74;
  const archStart = mobile ? 0.82 : 0.78;
  const passStart = mobile ? 0.89 : 0.85;
  const finalStart = mobile ? 0.94 : 0.91;
  const cardGap = mobile ? 1.25 : 2.8;
  const frameOffset = 0.82;
  const cardTravelLength = (cards.length - 1) * cardGap + frameOffset + 1.05;
  const oneCardScrollLength = (cardsEnd * scrollable * cardGap) / cardTravelLength;
  const introScrollLength = oneCardScrollLength;
  if (mobile) {
    if (!mobileVirtualReady) {
      mobileVirtualScroll = 0;
      mobileSnapIndex = 0;
      mobileVirtualReady = true;
      window.scrollTo(0, 0);
    } else if (Math.abs(window.scrollY) > 1) {
      window.scrollTo(0, 0);
    }
  } else {
    mobileVirtualReady = false;
    mobileVirtualScroll = window.scrollY;
  }

  const effectiveScroll = mobile ? mobileVirtualScroll : window.scrollY;
  introTargetProgress = clamp(effectiveScroll / introScrollLength, 0, 1);
  introRenderProgress += (introTargetProgress - introRenderProgress) * 1;
  const introProgress = introRenderProgress;
  const introVanish = smoothStep(rangeProgress(introProgress, 0.5, 0.84));
  const introDepth = smoothStep(rangeProgress(introProgress, 0.2, 0.84));
  const introScale = 1 + introDepth * (mobile ? 1.45 : 2.15);
  const countdownDock = introProgress > 0.9 ? 1 : 0;
  const countdownFadeOut = 1 - smoothStep(rangeProgress(introProgress, 0.48, 0.6));
  const countdownFadeIn = smoothStep(rangeProgress(introProgress, 0.9, 0.98));
  const countdownOpacity = countdownDock ? countdownFadeIn : countdownFadeOut;
  const countdownDockTop = Math.max(18, Math.min(viewportHeight * 0.05, 52));
  setCountdownDocked(countdownDock > 0.5);
  intro.style.setProperty("--intro-screen-opacity", "1");
  introText.style.setProperty("--intro-y", "0vh");
  introText.style.setProperty("--intro-scale", introScale.toFixed(3));
  introText.style.setProperty("--intro-opacity", (1 - introVanish).toFixed(3));
  countdownPanel.classList.toggle("countdown--portal", countdownDock > 0.98);
  countdownPanel.style.setProperty("--countdown-top", `${countdownDockTop.toFixed(1)}px`);
  countdownPanel.style.setProperty("--countdown-scale", "0.9");
  const countdownHeroWidth = mobile ? "min(93vw, 620px)" : "min(86vw, 1120px)";
  const countdownDockedWidth = mobile ? "min(88vw, 540px)" : "min(76vw, 820px)";
  countdownPanel.style.setProperty("--countdown-width", countdownDock > 0.5 ? countdownDockedWidth : countdownHeroWidth);
  countdownPanel.style.setProperty("--countdown-opacity", countdownOpacity.toFixed(3));
  countdownPanel.style.setProperty("--countdown-events", "none");

  storyProgress = clamp((effectiveScroll - story.offsetTop) / scrollable, 0, 1);
  const cardProgress = clamp(storyProgress / cardsEnd, 0, 1);
  const rawTravel = cardProgress * cardTravelLength;
  const travel = rawTravel;
  stepPosition = travel;
  const frameDepth = mobile ? 780 : 1050;
  archProgress = clamp((storyProgress - archStart) / (1 - archStart), 0, 1);
  passProgress = clamp((storyProgress - passStart) / (finalStart - passStart), 0, 1);
  finaleProgress = clamp((storyProgress - finalStart) / (1 - finalStart), 0, 1);

  siteBackground.style.setProperty("--site-bg-scale", (1.04 + storyProgress * (mobile ? 0.08 : 0.12)).toFixed(3));
  canvas.style.setProperty("--scene-opacity", smoothStep(archProgress).toFixed(3));
  const cardsVisible = introProgress > 0.96;
  let activeCardIndex = -1;
  let activeCardDistance = Infinity;

  cards.forEach((card, index) => {
    const localTravel = travel - index * cardGap - frameOffset;
    const distance = Math.abs(localTravel);
    if (distance < activeCardDistance) {
      activeCardDistance = distance;
      activeCardIndex = index;
    }
  });

  cards.forEach((card, index) => {
    const side = card.classList.contains("story-card--right") ? 1 : -1;
    const localTravel = travel - index * cardGap - frameOffset;
    const z = slowNearCenter(localTravel, mobile ? 0.56 : 0.42, mobile ? 0.46 : 0.34) * frameDepth;
    const focus = clamp(1 - Math.abs(z) / (mobile ? 700 : 820), 0, 1);
    const fullFocus = clamp(1 - Math.abs(z) / (mobile ? 390 : 430), 0, 1);
    const isActive = index === activeCardIndex && activeCardDistance < 1.08;
    const opacity = isActive ? cardOpacity(localTravel) * (storyProgress < archStart && cardsVisible ? 1 : 0) : 0;
    const horizontal = 0;
    const vertical = mobile ? (window.innerWidth <= 460 ? 6 : 5) : 0;
    const scale = 1;

    card.style.setProperty("--card-opacity", opacity.toFixed(3));
    card.style.setProperty("--card-scale", scale.toFixed(3));
    card.style.setProperty("--card-x", `${horizontal}vw`);
    card.style.setProperty("--card-y", `${vertical}${mobile ? "vh" : "px"}`);
    card.style.setProperty("--card-z", `${z}px`);
    card.style.pointerEvents = isActive && fullFocus > 0.35 && storyProgress < archStart ? "auto" : "none";
  });

  portalFinale.style.setProperty("--portal-opacity", smoothStep(finaleProgress).toFixed(3));
  portalFinale.style.setProperty("--portal-scale", (0.94 + smoothStep(finaleProgress) * 0.06).toFixed(3));
  portalFinale.style.setProperty("--portal-y", `${(1 - smoothStep(finaleProgress)) * 24}px`);
  portalFinale.style.setProperty("--portal-events", finaleProgress > 0.75 ? "auto" : "none");
}

function createVerticalFadeMap() {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);

  gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
  gradient.addColorStop(0.46, "rgba(0, 0, 0, 0)");
  gradient.addColorStop(0.72, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 1)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function createAssetPlane(texture, width, height, x, y, z, options = {}) {
  const group = new THREE.Group();
  group.position.set(x, y, z);

  const geometry = new THREE.PlaneGeometry(width, height, 28, 1);
  const position = geometry.attributes.position;
  for (let index = 0; index < position.count; index += 1) {
    const px = position.getX(index);
    const normalized = px / (width / 2);
    position.setZ(index, -Math.cos(normalized * Math.PI * 0.5) * 0.075 + 0.075);
  }
  geometry.computeVertexNormals();

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    alphaMap: options.alphaMap || null,
    transparent: true,
    alphaTest: options.alphaTest ?? 0.08,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false,
  });

  const main = new THREE.Mesh(geometry, material);
  group.add(main);

  return group;
}

function initScene() {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0.55, 7.1);

  const root = new THREE.Group();
  scene.add(root);

  const loader = new THREE.TextureLoader();
  const loadTexture = (path) =>
    loader.load(path, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.needsUpdate = true;
    });

  const brideTexture = loadTexture(assetUrls.bride || "./assets/bride-white.png");
  const groomTexture = loadTexture(assetUrls.groom || "./assets/groom-white.png");
  const archTexture = loadTexture(assetUrls.arch || "./assets/arch-line.png");
  const meadowTexture = loadTexture(assetUrls.meadow || "./assets/grass-medium-lines.png");
  const meadowFadeMap = createVerticalFadeMap();
  const setRenderOrder = (object, order) => {
    object.traverse((child) => {
      child.renderOrder = order;
    });
  };

  const arch = createAssetPlane(archTexture, 3.7, 4.55, 0.18, -0.06, -0.72);
  const bride = createAssetPlane(brideTexture, 1.3, 2.15, -0.42, -1.02, 0.1);
  const groom = createAssetPlane(groomTexture, 1.0, 2.15, 0.78, -1.02, 0.16);
  const meadow = createAssetPlane(meadowTexture, 15.8, 3.08, 0.02, -1.86, 0.34, {
    alphaMap: meadowFadeMap,
    alphaTest: 0.01,
  });

  bride.rotation.y = 0.08;
  groom.rotation.y = -0.08;
  setRenderOrder(meadow, 1);
  setRenderOrder(arch, 2);
  setRenderOrder(bride, 3);
  setRenderOrder(groom, 3);
  root.add(meadow, arch, bride, groom);

  const resize = () => {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  const lookTarget = new THREE.Vector3();
  const animate = () => {
    const mobile = window.matchMedia("(max-width: 860px)").matches;
    const viewportWidth = window.innerWidth || canvas.clientWidth || 0;
    const viewportHeight = window.innerHeight || canvas.clientHeight || 0;
    const compactMobile = mobile && viewportWidth <= 460;
    const shortMobile = mobile && viewportHeight <= 740;
    updateStory();

    const revealEase = smoothStep(archProgress);
    const passEase = smoothStep(passProgress);
    const finalEase = smoothStep(finaleProgress);
    const mobileBaseScale = compactMobile ? 0.38 : 0.44;
    const mobileRevealScale = compactMobile ? 0.045 : 0.055;
    const mobilePassScale = compactMobile ? 0.055 : 0.08;
    const sceneScale = (mobile ? mobileBaseScale : 0.66) + revealEase * (mobile ? mobileRevealScale : 0.12) + passEase * (mobile ? mobilePassScale : 0.2);
    const meadowLift = (1 - revealEase) * -0.1 + passEase * (compactMobile ? 0.02 : 0.08);
    const gateSpread = passEase * (mobile ? 0.12 : 0.92);
    const mobileRootBaseY = compactMobile ? (shortMobile ? -0.76 : -0.68) : -0.46;

    root.rotation.y = 0;
    root.rotation.x = 0;
    root.position.x = 0;
    root.position.y = (mobile ? mobileRootBaseY : -0.2) + (1 - revealEase) * 0.08 - passEase * (mobile ? 0.01 : 0.08) + finalEase * (compactMobile ? -0.01 : 0.03);
    root.scale.setScalar(sceneScale);

    arch.rotation.y = 0;
    bride.rotation.y = mobile ? 0 : 0.08;
    groom.rotation.y = mobile ? 0 : -0.08;
    bride.position.x = (mobile ? -0.18 : -0.42) - gateSpread;
    groom.position.x = (mobile ? 0.54 : 0.78) + gateSpread;
    bride.position.z = 0.1 + passEase * 0.2;
    groom.position.z = 0.16 + passEase * 0.2;
    meadow.rotation.y = 0;
    meadow.position.x = 0.02;
    meadow.position.y = (compactMobile ? -2.1 : -1.94) - meadowLift;

    camera.position.x = 0;
    camera.position.y = (mobile ? (compactMobile ? 0.38 : 0.48) : 0.7) + passEase * (compactMobile ? 0.07 : 0.12);
    camera.position.z = (mobile ? (compactMobile ? 11.8 : 11.25) : 10.9) - passEase * (mobile ? (compactMobile ? 2.25 : 2.65) : 3.05);
    lookTarget.set(0.12, mobile ? (compactMobile ? -0.36 : -0.25) + passEase * (compactMobile ? 0.04 : 0.08) : -0.18 + passEase * 0.14, -0.2);
    camera.lookAt(lookTarget);

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  };

  window.addEventListener("resize", resize);
  resize();
  webglNote.hidden = true;
  sceneRunning = true;
  animate();
}

function startPage() {
  try {
  initScene();
} catch (error) {
  webglNote.textContent = "Не удалось загрузить 3D-сцену";
  console.error(error);
}

  setCountdownDocked(false);
  updateCountdown();
  updateStory();
  setInterval(updateCountdown, 1000);
  if (!sceneRunning) {
    window.addEventListener("scroll", updateStory, { passive: true });
  }
  initMobileSnap();
  window.addEventListener("scroll", scheduleSnapSettle, { passive: true });
  window.addEventListener("resize", updateStory);
}

import("https://unpkg.com/three@0.164.1/build/three.module.js")
  .then((module) => {
    THREE = module;
    startPage();
  })
  .catch((error) => {
    webglNote.textContent = "РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ 3D-СЃС†РµРЅСѓ";
    setCountdownDocked(false);
    updateCountdown();
    updateStory();
    setInterval(updateCountdown, 1000);
    window.addEventListener("scroll", updateStory, { passive: true });
    initMobileSnap();
    window.addEventListener("scroll", scheduleSnapSettle, { passive: true });
    window.addEventListener("resize", updateStory);
    console.error(error);
  });
