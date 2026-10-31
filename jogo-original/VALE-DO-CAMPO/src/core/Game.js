/**
 * Sequência de inicialização do jogo.
 *
 * A ordem abaixo reproduz exatamente a ordem em que os <script> do arquivo original
 * executavam seus comandos de topo (registro de extensões, carregamento do save,
 * criação de interface, início do laço). Alterar a ordem pode mudar o comportamento:
 * por exemplo, o carregamento do save (bootLoadGame) acontece ANTES das extensões da
 * floresta amazônica, que depois completam os dados (bootAmazon) — como no original.
 */
import { loadGraphicsSettings } from '../config/settings.js';
import { bootLoadGame, bootUI } from './Bootstrap.js';
import { startLoop } from './GameLoop.js';
import { initKeyboard } from './InputManager.js';
import { initAutosave } from './SaveManager.js';
import { initCowPixelSprite, loadCowSprite } from '../entities/cow/CowRenderer.js';
import { initFounderCow, initGestationBadge } from '../entities/cow/Herd.js';
import { loadChickenSprites } from '../entities/farm/Chickens.js';
import { eggEntities } from '../entities/farm/Eggs.js';
import { loadFoxSprite } from '../entities/farm/FarmFoxes.js';
import { loadWormSprite } from '../entities/farm/Worms.js';
import { loadGolemSprite } from '../entities/Giant.js';
import { loadLegacyPlayerSprite } from '../entities/Player.js';
import { installTerrainSpeed } from '../entities/PlayerMovement.js';
import { installActionAnimations, loadPlayerSprite } from '../entities/PlayerSprite.js';
import { loadAnacondaSprite, registerAnacondaStates } from '../entities/wild/Anaconda.js';
import { loadHarpySprites, registerHarpyStates } from '../entities/wild/Harpy.js';
import { loadFaunaSprites } from '../entities/wild/Fauna.js';
import { loadJaguarSprite } from '../entities/wild/Jaguar.js';
import { bootAmazon } from '../features/amazon/AmazonBoot.js';
import { installAmazonEcology } from '../features/amazon/AmazonEcology.js';
import { installAmazonItems } from '../features/amazon/AmazonItems.js';
import { installAmazonRender } from '../features/amazon/AmazonRender.js';
import { initAmazonTrees } from '../features/amazon/AmazonTrees.js';
import { installBees } from '../features/amazon/Bees.js';
import { installFallenLogs } from '../features/amazon/FallenLogs.js';
import { initLitter } from '../features/amazon/Litter.js';
import { initCanvas } from '../rendering/Canvas.js';
import { entityProviders } from '../rendering/Renderer.js';
import { fecesEntities } from '../world/Feces.js';
import { loadSprites } from '../rendering/Sprites.js';
import {
  installNightDarkness,
  installTorchPost,
  installTorchSprite,
  installTorchUpdate,
  registerTorchItem,
} from '../rendering/Torch.js';
import { initLofi } from '../systems/audio/LofiMusic.js';
import { installMasterVolume } from '../systems/audio/MasterVolume.js';
import { loadCropSprites } from '../systems/FarmingSystem.js';
import { fenceEntities, loadFenceSprites } from '../systems/Fences.js';
import { initAxeBar } from '../systems/Woodcutting.js';
import { initCraftingUI } from '../ui/CraftingUI.js';
import { initInventoryUI } from '../ui/InventoryUI.js';
import { initMapUI } from '../ui/MapUI.js';
import { initFullscreen } from '../ui/Fullscreen.js';
import { initMenu, initSettingsControls } from '../ui/MenuUI.js';
import { initActionButtons, initJoystick } from '../ui/MobileControls.js';
import { initAllelopathy } from '../world/Allelopathy.js';
import { installHomeGuards, installInstanceUpdate } from '../world/Instances.js';
import { openInstanceStore } from '../world/InstanceStore.js';
import { loadTreeSprites } from '../world/Trees.js';
import { initQuests } from '../world/village/Quests.js';
import { installOrographicRain, loadWeather } from '../world/WeatherSystem.js';

let booted = false;

/** Inicializa todos os sistemas na ordem original. Deve ser chamada uma única vez. */
export function boot() {
  if (booted) return;
  booted = true;

  // --- bloco <script> nº 1 do original ---
  installMasterVolume();

  // --- bloco <script> nº 2 do original ---
  loadGraphicsSettings();
  openInstanceStore();
  installHomeGuards();
  installInstanceUpdate();
  installOrographicRain();
  initCanvas();
  initQuests();
  loadChickenSprites();
  loadWormSprite();
  loadFoxSprite();
  loadWeather();
  loadCropSprites();
  loadTreeSprites();
  loadSprites();
  loadFenceSprites();
  entityProviders.push(fenceEntities, eggEntities, fecesEntities); // cercas/portões, ovos e fezes entram na ordenação por Y do Renderer
  loadLegacyPlayerSprite();
  initCowPixelSprite();
  loadCowSprite();
  loadFaunaSprites();
  loadJaguarSprite();
  loadAnacondaSprite();
  registerAnacondaStates();
  loadHarpySprites();
  registerHarpyStates();
  initFounderCow();
  initGestationBadge();
  initJoystick();
  initActionButtons();
  initKeyboard();
  initMenu();
  initFullscreen();
  installTerrainSpeed();
  initAxeBar();
  bootLoadGame();
  initSettingsControls();
  bootUI();
  initAutosave();
  startLoop();

  // --- bloco <script> nº 3 do original ---
  initLofi();

  // --- bloco <script> nº 6 do original ---
  loadPlayerSprite();
  installActionAnimations();

  // --- bloco <script> nº 7 do original ---
  registerTorchItem();

  // --- bloco <script> nº 8 do original ---
  installNightDarkness();
  installTorchSprite();
  installTorchPost();
  installTorchUpdate();

  // --- bloco <script> nº 9 do original ---
  loadGolemSprite();

  // --- bloco <script> nº 10 do original ---
  initInventoryUI();
  initCraftingUI();

  // --- bloco <script> nº 11 do original ---
  initMapUI();

  // --- bloco <script> nº 12 do original ---
  initAllelopathy();

  // --- bloco <script> nº 13 do original ---
  initAmazonTrees();
  installAmazonRender();
  installAmazonItems();
  installAmazonEcology();
  installFallenLogs();
  initLitter();
  installBees();
  bootAmazon();
}
