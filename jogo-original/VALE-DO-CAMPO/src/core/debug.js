/**
 * Ferramentas de depuração (ativas com ?debug na URL ou no servidor de desenvolvimento).
 *
 * window.VDC.modules  -> todos os módulos do jogo (namespaces)
 * window.VDC.run(code) -> avalia uma expressão com acesso aos nomes do jogo, por exemplo:
 *     VDC.run('S.min = 1000')          // avança o relógio
 *     VDC.run('climate.kind = 3')      // força tempestade no próximo planejamento
 * Atribuições a variáveis de módulo (ex.: "sleeping = true") usam os setters exportados.
 * Os testes de regressão (tests/regression) usam essa mesma interface.
 */
import * as m0 from '../config/balance.js';
import * as m1 from '../config/constants.js';
import * as m2 from '../config/settings.js';
import * as m3 from './Bootstrap.js';
import * as m4 from './GameLoop.js';
import * as m5 from './GameState.js';
import * as m6 from './GameUpdate.js';
import * as m7 from './InputManager.js';
import * as m8 from './NewGame.js';
import * as m9 from './SaveManager.js';
import * as m10 from './SaveMigrations.js';
import * as m11 from './TimeManager.js';
import * as m12 from '../entities/Carcass.js';
import * as m13 from '../entities/Giant.js';
import * as m14 from '../entities/NPC.js';
import * as m15 from '../entities/Player.js';
import * as m16 from '../entities/PlayerMovement.js';
import * as m17 from '../entities/PlayerSprite.js';
import * as m18 from '../entities/Werewolf.js';
import * as m19 from '../entities/ai/Steering.js';
import * as m20 from '../entities/animals/AnimalSocial.js';
import * as m21 from '../entities/cow/Cow.js';
import * as m22 from '../entities/cow/CowGenetics.js';
import * as m23 from '../entities/cow/CowRenderer.js';
import * as m24 from '../entities/cow/Herd.js';
import * as m25 from '../entities/farm/Chickens.js';
import * as m26 from '../entities/farm/FarmFoxes.js';
import * as m27 from '../entities/farm/Nests.js';
import * as m28 from '../entities/farm/Worms.js';
import * as m29 from '../entities/wild/Anaconda.js';
import * as m30 from '../entities/wild/Fauna.js';
import * as m31 from '../entities/wild/FaunaWater.js';
import * as m32 from '../entities/wild/Jaguar.js';
import * as m33 from '../features/amazon/AmazonBoot.js';
import * as m34 from '../features/amazon/AmazonEcology.js';
import * as m35 from '../features/amazon/AmazonItems.js';
import * as m36 from '../features/amazon/AmazonRender.js';
import * as m37 from '../features/amazon/AmazonTrees.js';
import * as m38 from '../features/amazon/Bees.js';
import * as m39 from '../features/amazon/FallenLogs.js';
import * as m40 from '../features/amazon/Litter.js';
import * as m41 from '../rendering/Atmosphere.js';
import * as m42 from '../rendering/Canvas.js';
import * as m43 from '../rendering/Characters.js';
import * as m44 from '../rendering/Effects.js';
import * as m45 from '../rendering/LakeRenderer.js';
import * as m46 from '../rendering/LightingSystem.js';
import * as m47 from '../rendering/Relief.js';
import * as m48 from '../rendering/Renderer.js';
import * as m49 from '../rendering/ShadowSystem.js';
import * as m50 from '../rendering/SpriteUtils.js';
import * as m51 from '../rendering/Sprites.js';
import * as m52 from '../rendering/TileRenderer.js';
import * as m53 from '../rendering/Torch.js';
import * as m54 from '../rendering/WeatherRenderer.js';
import * as m55 from '../systems/CollisionSystem.js';
import * as m56 from '../systems/FarmingSystem.js';
import * as m57 from '../systems/Fishing.js';
import * as m58 from '../systems/InteractionSystem.js';
import * as m59 from '../systems/InventorySystem.js';
import * as m60 from '../systems/Woodcutting.js';
import * as m61 from '../systems/audio/AmbientSounds.js';
import * as m62 from '../systems/audio/AnimalSounds.js';
import * as m63 from '../systems/audio/AudioSystem.js';
import * as m64 from '../systems/audio/LofiMusic.js';
import * as m65 from '../systems/audio/MasterVolume.js';
import * as m66 from '../systems/audio/WeatherAudio.js';
import * as m67 from '../ui/Dialog.js';
import * as m68 from '../ui/HUD.js';
import * as m69 from '../ui/HomeArrow.js';
import * as m70 from '../ui/Hotbar.js';
import * as m71 from '../ui/InventoryUI.js';
import * as m72 from '../ui/MapUI.js';
import * as m73 from '../ui/MenuUI.js';
import * as m74 from '../ui/MobileControls.js';
import * as m75 from '../ui/Toast.js';
import * as m76 from '../ui/dom.js';
import * as m77 from '../utils/MathUtils.js';
import * as m78 from '../utils/Noise.js';
import * as m79 from '../utils/Random.js';
import * as m80 from '../utils/compression.js';
import * as m81 from '../world/Allelopathy.js';
import * as m82 from '../world/BackgroundSim.js';
import * as m83 from '../world/GrassSystem.js';
import * as m84 from '../world/HouseInterior.js';
import * as m85 from '../world/InstanceStore.js';
import * as m86 from '../world/Instances.js';
import * as m87 from '../world/Mushrooms.js';
import * as m88 from '../world/RainSystem.js';
import * as m89 from '../world/Seasons.js';
import * as m90 from '../world/Trees.js';
import * as m91 from '../world/Vegetation.js';
import * as mPlantSpecies from '../world/PlantSpecies.js';
import * as mPlantsCfg from '../config/plants.js';
import * as mTrails from '../world/Trails.js';
import * as mFarmPrey from '../entities/farm/FarmPrey.js';
import * as mTrampling from '../config/trampling.js';
import * as m92 from '../world/Village.js';
import * as m93 from '../world/WaterSystem.js';
import * as m94 from '../world/WeatherSystem.js';
import * as m95 from '../world/World.js';
import * as m96 from '../world/WorldData.js';
import * as m97 from '../world/WorldGen.js';
import * as m98 from '../world/ecology/TreeEcology.js';
import * as m99 from '../world/hydrology/Fluvial.js';
import * as m100 from '../world/hydrology/Hydrology.js';
import * as m101 from '../world/hydrology/Puddles.js';
import * as m102 from '../world/hydrology/RiverFlow.js';
import * as m103 from '../world/village/Quests.js';
import * as m104 from '../world/village/Vendor.js';
import * as m105 from '../config/progression.js';
import * as m106 from '../systems/Progression.js';
import * as m107 from '../ui/HarvestFx.js';
import * as m108 from '../world/village/Upgrades.js';
import * as m109 from '../config/fences.js';
import * as m110 from '../config/animalFood.js';
import * as m111 from '../config/eggs.js';
import * as m112 from '../config/crafting.js';
import * as m113 from '../systems/Fences.js';
import * as m114 from '../systems/Crafting.js';
import * as m121 from '../config/ecosystem.js';
import * as m122 from '../entities/ai/Perception.js';
import * as m123 from '../entities/PlayerHurt.js';
import * as m124 from '../rendering/AnimalStatus.js';
import * as m125 from '../rendering/Entities.js';
import * as m126 from '../rendering/TreeRenderer.js';
import * as m127 from '../rendering/Ablate.js';
import * as m115 from '../entities/farm/Eggs.js';
import * as m116 from '../entities/farm/Chickens.js';
import * as m117 from '../entities/cow/Cow.js';
import * as m118 from '../entities/cow/Herd.js';
import * as m119 from '../world/Instances.js';
import * as m120 from '../core/SaveManager.js';
import * as m200 from '../systems/Vitals.js';
import * as m201 from '../world/Feces.js';
import * as m202 from '../config/feces.js';

const MODULES = {
  'systems/Vitals': m200,
  'world/Feces': m201,
  'config/feces': m202,
  'config/balance': m0,
  'config/constants': m1,
  'config/settings': m2,
  'core/Bootstrap': m3,
  'core/GameLoop': m4,
  'core/GameState': m5,
  'core/GameUpdate': m6,
  'core/InputManager': m7,
  'core/NewGame': m8,
  'core/SaveManager': m9,
  'core/SaveMigrations': m10,
  'core/TimeManager': m11,
  'entities/Carcass': m12,
  'entities/Giant': m13,
  'entities/NPC': m14,
  'entities/Player': m15,
  'entities/PlayerMovement': m16,
  'entities/PlayerSprite': m17,
  'entities/Werewolf': m18,
  'entities/ai/Steering': m19,
  'entities/animals/AnimalSocial': m20,
  'entities/cow/Cow': m21,
  'entities/cow/CowGenetics': m22,
  'entities/cow/CowRenderer': m23,
  'entities/cow/Herd': m24,
  'entities/farm/Chickens': m25,
  'entities/farm/FarmFoxes': m26,
  'entities/farm/Nests': m27,
  'entities/farm/Worms': m28,
  'entities/wild/Anaconda': m29,
  'entities/wild/Fauna': m30,
  'entities/wild/FaunaWater': m31,
  'entities/wild/Jaguar': m32,
  'features/amazon/AmazonBoot': m33,
  'features/amazon/AmazonEcology': m34,
  'features/amazon/AmazonItems': m35,
  'features/amazon/AmazonRender': m36,
  'features/amazon/AmazonTrees': m37,
  'features/amazon/Bees': m38,
  'features/amazon/FallenLogs': m39,
  'features/amazon/Litter': m40,
  'rendering/Atmosphere': m41,
  'rendering/Canvas': m42,
  'rendering/Characters': m43,
  'rendering/Effects': m44,
  'rendering/LakeRenderer': m45,
  'rendering/LightingSystem': m46,
  'rendering/Relief': m47,
  'rendering/Renderer': m48,
  'rendering/ShadowSystem': m49,
  'rendering/SpriteUtils': m50,
  'rendering/Sprites': m51,
  'rendering/TileRenderer': m52,
  'rendering/Torch': m53,
  'rendering/WeatherRenderer': m54,
  'systems/CollisionSystem': m55,
  'systems/FarmingSystem': m56,
  'systems/Fishing': m57,
  'systems/InteractionSystem': m58,
  'systems/InventorySystem': m59,
  'systems/Woodcutting': m60,
  'systems/audio/AmbientSounds': m61,
  'systems/audio/AnimalSounds': m62,
  'systems/audio/AudioSystem': m63,
  'systems/audio/LofiMusic': m64,
  'systems/audio/MasterVolume': m65,
  'systems/audio/WeatherAudio': m66,
  'ui/Dialog': m67,
  'ui/HUD': m68,
  'ui/HomeArrow': m69,
  'ui/Hotbar': m70,
  'ui/InventoryUI': m71,
  'ui/MapUI': m72,
  'ui/MenuUI': m73,
  'ui/MobileControls': m74,
  'ui/Toast': m75,
  'ui/dom': m76,
  'utils/MathUtils': m77,
  'utils/Noise': m78,
  'utils/Random': m79,
  'utils/compression': m80,
  'world/Allelopathy': m81,
  'world/BackgroundSim': m82,
  'world/GrassSystem': m83,
  'world/HouseInterior': m84,
  'world/InstanceStore': m85,
  'world/Instances': m86,
  'world/Mushrooms': m87,
  'world/RainSystem': m88,
  'world/Seasons': m89,
  'world/Trees': m90,
  'world/Vegetation': m91,
  'world/PlantSpecies': mPlantSpecies,
  'config/plants': mPlantsCfg,
  'world/Trails': mTrails,
  'entities/farm/FarmPrey': mFarmPrey,
  'config/trampling': mTrampling,
  'world/Village': m92,
  'world/WaterSystem': m93,
  'world/WeatherSystem': m94,
  'world/World': m95,
  'world/WorldData': m96,
  'world/WorldGen': m97,
  'world/ecology/TreeEcology': m98,
  'world/hydrology/Fluvial': m99,
  'world/hydrology/Hydrology': m100,
  'world/hydrology/Puddles': m101,
  'world/hydrology/RiverFlow': m102,
  'world/village/Quests': m103,
  'world/village/Vendor': m104,
  'config/progression': m105,
  'systems/Progression': m106,
  'ui/HarvestFx': m107,
  'world/village/Upgrades': m108,
  'config/fences': m109,
  'config/animalFood': m110,
  'config/eggs': m111,
  'config/crafting': m112,
  'systems/Fences': m113,
  'systems/Crafting': m114,
  'entities/farm/Eggs': m115,
  'entities/farm/Chickens': m116,
  'entities/cow/Cow': m117,
  'entities/cow/Herd': m118,
  'world/Instances': m119,
  'core/SaveManager': m120,
  'config/ecosystem': m121,
  'entities/ai/Perception': m122,
  'entities/PlayerHurt': m123,
  'rendering/AnimalStatus': m124,
  'rendering/Entities': m125,
  'rendering/TreeRenderer': m126,
  'rendering/Ablate': m127,
};
const SETTERS = {
  qDrop: ['config/settings', 'setQDrop'],
  LK: ['world/World', 'setLK'],
  FORCE_LK: ['core/NewGame', 'setFORCE_LK'],
  FORCE_SEED: ['core/NewGame', 'setFORCE_SEED'],
  grassDirty: ['world/GrassSystem', 'setGrassDirty'],
  ground: ['world/World', 'setGround'],
  obj: ['world/World', 'setObj'],
  wet: ['world/World', 'setWet'],
  crops: ['world/World', 'setCrops'],
  S: ['core/GameState', 'setS'],
  sleeping: ['core/GameState', 'setSleeping'],
  qIdx: ['world/village/Quests', 'setQIdx'],
  chx: ['entities/farm/Chickens', 'setChx'],
  fox: ['entities/farm/FarmFoxes', 'setFox'],
  ninhos: ['entities/farm/Nests', 'setNinhos'],
  runDust: ['entities/PlayerMovement', 'setRunDust'],
  lkdT: ['rendering/LakeRenderer', 'setLkdT'],
  cow: ['entities/cow/Cow', 'setCow'],
  shoreList: ['entities/cow/Cow', 'setShoreList'],
  gest: ['entities/cow/Herd', 'setGest'],
  faInitDone: ['entities/wild/Fauna', 'setFaInitDone'],
  faShoreL: ['entities/wild/Fauna', 'setFaShoreL'],
  faShoreT: ['entities/wild/Fauna', 'setFaShoreT'],
  FTT: ['entities/wild/Jaguar', 'setFTT'],
  HCX: ['world/hydrology/Hydrology', 'setHCX'],
  HCY: ['world/hydrology/Hydrology', 'setHCY'],
  lakeLevel: ['world/hydrology/Hydrology', 'setLakeLevel'],
  lakeStore: ['world/hydrology/Hydrology', 'setLakeStore'],
  curQ: ['world/hydrology/RiverFlow', 'setCurQ'],
  ecoTrees: ['world/ecology/TreeEcology', 'setEcoTrees'],
  ecoStarted: ['world/ecology/TreeEcology', 'setEcoStarted'],
  axeLast: ['systems/Woodcutting', 'setAxeLast'],
  stableNeed: ['core/GameLoop', 'setStableNeed'],
  fishWTt: ['systems/Fishing', 'setFishWTt'],
  amzDrops: ['features/amazon/AmazonTrees', 'setAmzDrops'],
  BOLT: ['features/amazon/AmazonTrees', 'setBOLT'],
  visTrees: ['features/amazon/AmazonTrees', 'setVisTrees'],
  visT: ['features/amazon/AmazonTrees', 'setVisT'],
  flashPrev: ['features/amazon/AmazonTrees', 'setFlashPrev'],
};

export function installDebug() {
  const owner = new Map();
  for (const ns of Object.values(MODULES)) for (const n of Object.keys(ns)) if (!owner.has(n)) owner.set(n, ns);
  const scope = new Proxy(Object.create(null), {
    has: (_t, n) => typeof n === 'string' && owner.has(n),
    get: (_t, n) => (n === Symbol.unscopables ? undefined : owner.get(n)?.[n]),
    set: (_t, n, v) => {
      const s = SETTERS[n];
      if (!s) throw new TypeError('VDC: "' + String(n) + '" não pode ser reatribuída de fora do módulo');
      MODULES[s[0]][s[1]](v);
      return true;
    },
  });
  // eslint-disable-next-line no-new-func
  const evaluate = new Function('scope', 'code', 'with (scope) { return eval(code); }');
  window.VDC = { modules: MODULES, scope, run: (code) => evaluate(scope, code) };
  return window.VDC;
}
