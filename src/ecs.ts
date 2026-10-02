/**
 * Мини-ECS. Компоненты — плоские структуры без методов,
 * системы — функции над World. Никакой логики в сущностях.
 */
import type { Floor } from './floor';
import type { Rng } from './rng';
import type { TileMap } from './room';
import type { InputSnapshot } from './input';
import { profiler } from './profiler';

export type Entity = number;
export type Faction = 'player' | 'enemy';

/** Положение. px/py — положение на прошлом шаге, для интерполяции рендера. */
export interface Transform {
  x: number;
  y: number;
  px: number;
  py: number;
}

/** Тело: скорость и половина стороны хитбокса. */
export interface Body {
  vx: number;
  vy: number;
  radius: number;
}

export interface Health {
  hp: number;
  max: number;
  /** Пока > 0 — урон не проходит. */
  iframes: number;
  /** Пока > 0 — тело залито белым. */
  flash: number;
}

export type PlayerPhase = 'normal' | 'dash';

export interface PlayerC {
  /** Единичный вектор на курсор. */
  aimX: number;
  aimY: number;
  phase: PlayerPhase;
  fireCooldown: number;
  /** Индекс текущей формы оружия в WEAPON_FORMS. */
  form: number;
  /** Пауза после переключения формы. */
  switchCooldown: number;
  /** Патроны в обойме каждой формы. Обоймы не общие. */
  ammo: number[];
  /** Запас сверх обоймы: из него идёт перезарядка. Кончился — меняй форму. */
  reserve: number[];
  /** Идёт ли перезарядка текущей формы и сколько ей осталось. */
  reloading: boolean;
  reloadTimer: number;
  /** Накопленный заряд зарядной формы, секунды. */
  charge: number;
  /** Сколько снарядов залпа осталось выпустить и когда следующий. */
  queued: number;
  queueTimer: number;
  /** Сколько держим ПКМ с момента захвата: по нему короткое нажатие отличается от удержания. */
  grabTime: number;
  /** Телекинез: запас энергии, пауза до восполнения и что сейчас держим. */
  energy: number;
  energyDelay: number;
  held: Entity;
  dashTime: number;
  dashCooldown: number;
  /** Пока > 0 — разгон срезан: субъект разворачивается на месте. */
  turnLock: number;
  dashX: number;
  dashY: number;
}

/** Общее для всякого сотрудника: какую ставку он занимает. */
/** Слот инвентаря. Пустой id — слота нет, применять нечего. */
export interface ToolState {
  id: string;
  /** Сколько секунд до следующего применения. */
  cooldown: number;
  /** Остаток применений. Отрицательное — предмет не тратится. */
  charges: number;
}

export interface StaffC {
  post: string;
  title: string;
  /** Меньше — раньше закрывают вакансию. */
  priority: number;
  /** Насечек на табличке. */
  plateMarks: number;
  /** Сколько табличек на груди. */
  plates: number;
  /** Сколько процентов кожи осталось: отсюда оттенок бетона. */
  skin: number;
  /** Форма силуэта. */
  silhouette: string;
  /** Пока > 0 — табличка светится: телеграф. */
  plateFlash: number;
  /** «На контроле»: внеплановая проверка, следствие взыскания. */
  control: boolean;
  /**
   * Приостановлен по предписанию: секунды до возобновления. Пока больше
   * нуля — должность не ходит, не стреляет и не считает такты. Урон при
   * этом получает: приостановка снимает давление, а не защищает.
   */
  frozen: number;
}

export type InternPhase = 'route' | 'promotion';

export interface InternC {
  phase: InternPhase;
  /** Куда идёт сейчас. */
  targetX: number;
  targetY: number;
  /** Пауза на точке или обратный отсчёт переназначения. */
  timer: number;
  /** На какую должность его переводят. */
  promoteTo: string;
}

export interface InspectorC {
  /** Ось движения: 0 — по горизонтали, 1 — по вертикали. */
  axis: 0 | 1;
  /** Куда стреляет: единичный вектор, зафиксированный на такте. */
  aimX: number;
  aimY: number;
  /** Сколько выстрелов осталось в текущем такте. */
  shotsLeft: number;
  /** Обратный отсчёт до следующего выстрела внутри такта. */
  shotTimer: number;
}

export type RegistrarPhase = 'idle' | 'windup' | 'fan';

export interface RegistrarC {
  phase: RegistrarPhase;
  timer: number;
  /** Обратный отсчёт до следующего приказа о закрытии ставки. */
  orderTimer: number;
  /** Обратный отсчёт добора со стороны. */
  hireTimer: number;
  /** Сколько человек уже добрано на этом участке. */
  hired: number;
}

/** Строка штатного расписания участка в работе. */
export interface RosterEntry {
  post: string;
  title: string;
  priority: number;
  quota: number;
  /** Пересчитывается каждый шаг по живым сотрудникам. */
  occupied: number;
}

export type CourierPhase = 'run' | 'deliver';

export interface CourierC {
  phase: CourierPhase;
  /** Сторона, к двери которой бежит. -1 — цели нет. */
  door: number;
  /** Обратный отсчёт вызова у двери. */
  timer: number;
  /** Сколько ещё пытается дойти до выбранной двери. */
  approachTimer: number;
}

export type ChiefPhase = 'hold' | 'windup';

export interface ChiefC {
  phase: ChiefPhase;
  /** Какая из трёх фаз идёт сейчас. */
  stage: 1 | 2 | 3;
  /** Пока больше нуля — перелом фазы: он замер и не стреляет. */
  breakTimer: number;
  /** Обратный отсчёт до циркуляра. */
  ringTimer: number;
  /** На сколько провёрнуто следующее кольцо. */
  twist: number;
  /** Обратный отсчёт до переназначения подчинённых. */
  reshuffleTimer: number;
}

/**
 * Главный архивариус. Не ходит: сидит за конторкой и держит вокруг себя
 * кольцо стеллажей. Пока кольцо сомкнуто, он закрыт от выстрела; чтобы
 * открылся, игроку надо ломать картотеки — тогда архивариус лезет за
 * делом сам и на это время становится уязвим.
 */
export interface ArchivistC {
  /** 'closed' — за стеллажами, 'open' — достаёт дело и уязвим. */
  phase: 'closed' | 'open';
  /** Сколько секунд ещё открыт. */
  openTimer: number;
  /** Сколько стеллажей кольца сломано с прошлого открытия. */
  broken: number;
  /** Угол кольца: стеллажи медленно обходят конторку. */
  angle: number;
  /** Пауза перед тем, как поставить новое кольцо. */
  raiseTimer: number;
}

/**
 * Секция освещения. Тепловой узел разбит на секции, и Смотритель их
 * гасит. Свет — его оружие и его слабость: в темноте он быстр и
 * неуязвим, под лампой медленный и открытый.
 */
export interface LightSection {
  x: number;
  y: number;
  lit: boolean;
  /** Сколько субъект уже держит её под рукой, чтобы зажечь. */
  charge: number;
}

/**
 * Смотритель узла. Не стреляет вовсе: он гасит свет и бьёт в упор. Весь
 * бой — гонка за освещением.
 */
export interface KeeperC {
  /** Обратный отсчёт до следующей погашенной секции. */
  douseTimer: number;
  /** Куда идёт сейчас: номер секции или -1. */
  target: number;
  /** Обратный отсчёт до следующего касания: бьёт он только в упор. */
  touchTimer: number;
}

/**
 * Комиссия. Три существа, действующие как один орган: кто сейчас молчит,
 * тот и председатель, и только по нему проходит урон.
 */
export interface CommissionC {
  /** Номер места в комиссии: 0, 1, 2. */
  seat: number;
  /** Председательствует ли сейчас — то есть молчит. */
  chair: boolean;
  /** Обратный отсчёт до смены председателя. */
  swapTimer: number;
  /** Обратный отсчёт до собственного выстрела. */
  shotTimer: number;
}

export type AuditorPhase = 'audit' | 'open' | 'shot';

export interface AuditorC {
  /** Пока 'audit' — урон по Ревизору не проходит. */
  phase: AuditorPhase;
  /** Что описывает сейчас. */
  target: Entity;
  /** Обратный отсчёт описи предмета или окна уязвимости. */
  timer: number;
  /** Сколько ещё пытаться дойти до текущего предмета. */
  approachTimer: number;
  /** Обратный отсчёт до следующего предписания. */
  shotTimer: number;
}

/**
 * 'cover' — предмет положен набок и работает укрытием: шире, прочнее и
 * не сдвигается телами.
 */
export type PropPhase = 'idle' | 'held' | 'thrown' | 'cover';

/** Физический объект участка: стул, шкаф, бетонный обломок. */
export interface PropC {
  kind: string;
  title: string;
  phase: PropPhase;
  mass: number;
  /** Внесён ли предмет в текущую опись Ревизора. */
  audited: boolean;
  /** Кого уже задел в этом полёте: одно тело — один удар. */
  lastHit: Entity;
}

/**
 * Рельс: укрытие, которое едет само. Архив переставляет стеллажи, и
 * укрытие, на которое ты рассчитывал, через несколько секунд уезжает.
 * Ведёт его своя система напрямую, а не физика: тележке на рельсе стены
 * не указ, она от них разворачивается.
 */
export interface RailC {
  /** Единичное направление хода. Меняется на разворотах. */
  dirX: number;
  dirY: number;
  /** Пикселей в секунду. */
  speed: number;
  /**
   * Чьё это кольцо. Отрицательное — ничьё, стеллаж едет сам по себе;
   * иначе им распоряжается архивариус, и по этому полю же считается,
   * сколько его кольца осталось.
   */
  owner?: Entity;
}

/**
 * Добыча: опечатанный шкаф или ячейка стола выдачи. Шкаф отдаёт
 * случайное, ячейка — то, что в ней названо.
 */
/**
 * Что стоит на участке под оформление. Первые четыре были всегда,
 * остальные — позиции прилавка: стол выдачи торгует не только
 * приложениями, иначе у талонов один сток и никакого решения.
 */
export type StashKind =
  | 'safe'
  | 'cell'
  | 'case'
  | 'special'
  | 'pass'
  | 'blank'
  | 'ammo'
  | 'heal'
  | 'evac';

export interface StashC {
  kind: StashKind;
  /** Что лежит в ячейке. У шкафа пусто: содержимое решается при вскрытии. */
  item: string;
  title: string;
  opened: boolean;
}

export interface BulletC {
  faction: Faction;
  damage: number;
  life: number;
  /** Сколько ещё тел пробьёт, прежде чем погаснуть. */
  pierce: number;
  /** Скорость доворота на цель, радиан в секунду. 0 — не наводится. */
  homing: number;
  /** Кого уже зацепил: пробивающий снаряд не бьёт одного дважды. */
  lastHit: Entity;
}

/**
 * Формы снарядов и силуэтов. 'card' — картотечная карточка: только
 * снаряды объекта, и ни одна форма субъекта с ней не совпадает.
 */
export type Shape = 'square' | 'diamond' | 'dot' | 'bar' | 'card';

/**
 * Кладовщик: сотрудник стола выдачи. Не заражён, в бою не участвует и
 * в штат не входит — двери из-за него не запираются и вакансий он не
 * занимает. Стоит за ячейками и оформляет выдачу.
 */
export interface ClerkC {
  title: string;
  /** Пока false — стол работает. Выстрел в кладовщика закрывает стол. */
  offended: boolean;
  /** Пока > 0 — кладовщик отписывается: табличка горит. */
  noteTime: number;
}

/** Стойка: одноразовое окошко, где забег можно поправить. */
export interface CounterC {
  kind: string;
  title: string;
  /** Одноразовость: подали один раз — окошко закрылось. */
  used: boolean;
}

/**
 * Оборудование: кулер, фикус, вешалка. Стоит и не пускает, пока в него
 * не влетели; после этого лежит и оставляет за собой след.
 */
export interface FixtureC {
  kind: string;
  title: string;
  /** Опрокинуто. Обратно не встаёт: убирать некому. */
  toppled: boolean;
  /** Куда разлилось: единичный вектор от точки удара. */
  spillX: number;
  spillY: number;
}

/** Талон на полу: служебная мелочь, оставшаяся от ставки. */
export interface TicketC {
  /** Сколько талонов засчитает этот листок. */
  value: number;
  /** Пауза перед притяжением: иначе талон влетает в субъекта на вылете. */
  delay: number;
}

export interface DrawC {
  shape: Shape;
  /** Половина стороны / радиус отрисовки. */
  size: number;
  color: number;
  /** Контур вместо заливки. */
  hollow: boolean;
  /** Стол под телом. */
  desk: boolean;
}

export type RunStatus = 'playing' | 'dead' | 'cleared';

/** Где мы: в вестибюле или на этаже. */
export type Scene = 'lobby' | 'run';

/**
 * Скрытые статы. Взыскание — цена за нарушение процедуры, выслуга —
 * награда за аккуратность. Оба влияют на игру, но в основном оверлее их
 * нет: игрок должен чувствовать перемену, а не читать её.
 */
export interface RecordState {
  penalty: number;
  service: number;
  /** Сколько имущества уже испорчено за забег. */
  broken: number;
  /** На текущем участке ещё не получали урона. */
  roomClean: boolean;
  /** Сколько сотрудников на текущем участке вышло «на контроле». */
  controlHere: number;
}

/** Pity-таймер выдачи: невезение обязано кончаться само. */
export interface RewardState {
  /** Шанс выдачи за следующий зачищенный участок, 0..1. */
  chance: number;
  /** Сколько участков подряд зачищено без выдачи. */
  dry: number;
  /** След последней выдачи приложения: что выпало, с каким весом и почему. */
  lastItem: string;
  lastOrder: string;
  lastWeight: number;
}

export interface Feedback {
  shake: number;
  hitstop: number;
  /** Замедление хода: сколько шагов симуляции ещё идти медленно. */
  slowMo: number;
  /** Кольцо аннулирования: остаток жизни и где оно вспыхнуло. */
  blankTime: number;
  blankX: number;
  blankY: number;
  /** Точечная волна телекинеза: захват и бросок. */
  warpTime: number;
  warpX: number;
  warpY: number;
  warpPower: number;
  /** Облако из разбитого огнетушителя: сколько ему осталось и где. */
  cloudTime: number;
  cloudX: number;
  cloudY: number;
  /**
   * Дульная вспышка: остаток и место. В тепловом узле это не украшение,
   * а единственный свет, который субъект носит с собой, — и потому
   * стрелять вслепую там дорого вдвойне.
   */
  shotTime: number;
  shotX: number;
  shotY: number;
}

export interface World {
  seed: number;
  rng: Rng;
  /** Номер шага симуляции с начала забега. */
  tick: number;
  floor: Floor;
  /** Индекс текущего помещения на этаже. */
  room: number;
  map: TileMap;
  /** Растёт при любой перестройке карты: рендеру пора перерисовать бетон. */
  mapToken: number;
  input: InputSnapshot;
  fx: Feedback;
  /**
   * Что прозвучало на этом шаге. Системы складывают сюда имена событий,
   * точка входа раз в кадр отдаёт их звуку и очищает. Симуляция про
   * сам звук не знает, поэтому детерминизм им не задет.
   */
  sounds: string[];
  status: RunStatus;
  scene: Scene;
  player: Entity;
  /** Штатное расписание текущего участка. */
  roster: RosterEntry[];
  /**
   * Опись забега: всё, что выдали. Приложения и инструкции несут
   * отсюда свои правки, инвентарь записан только как найденный.
   */
  build: string[];
  /**
   * Инвентарь: один активный предмет. В деле он не лежит — дело это
   * правки, а инвентарь применяют руками. Слот переезжает между
   * участками и обнуляется только с новым забегом.
   */
  tool: ToolState;
  /** Сколько бланков на руках. Ресурс субъекта, а не сущность. */
  blanks: number;
  /** Допуски: ими вскрывают шкафы и получают по описи со стола выдачи. */
  passes: number;
  /** Состояние выдачи: текущий шанс и сколько участков без неё. */
  reward: RewardState;
  /** Личное дело субъекта: взыскание, выслуга и чем они набраны. */
  record: RecordState;
  /**
   * На каком уровне забег сейчас: −1, −2, ... Здание глубже, чем
   * кажется, и это единственное число, по которому видно, насколько.
   */
  depth: number;
  /** Талоны: служебная мелочь со штата, копится за забег. */
  tickets: number;
  /**
   * Опись содержимого оплачена: видно, что лежит в опечатанных шкафах
   * этажа. Держится до конца забега — сведения не портятся.
   */
  listed: boolean;
  /**
   * План эвакуации найден: схема этажа снова показывает тот участок, в
   * котором субъект стоит. До того она врёт на один — это искажение
   * архива, а не поломка.
   */
  evacPlan: boolean;
  /**
   * Сколько секунд до следующей перестройки помещения. Считается только
   * там, где натурная часть этого требует; на прочих уровнях лежит
   * нулём и никого не касается.
   */
  rebuildIn: number;
  /** Сколько раз это помещение уже перестраивалось. */
  rebuilds: number;
  /**
   * Секции освещения текущего помещения. Пусто — помещение не разбито
   * на секции, и гасить в нём нечего.
   */
  sections: LightSection[];
  /** Благодарности: приёмные, взятые без единого попадания. */
  commendations: number;
  /**
   * Забег кончился и ещё не записан в архив. Симуляция только помечает;
   * пишет точка входа, как и со звуком.
   */
  runEnded: '' | 'dead' | 'cleared';
  /** Найденное дело прошлого экземпляра: строки записки. */
  note: string[];
  /** Какое дело с полки открыли. Отрицательное — ничего не открывали. */
  noteSlot: number;
  /** Общий метроном участка: по его долям бьют инспекторы. */
  metronome: number;
  /** Такт, на котором сейчас участок. */
  beat: number;

  nextEntity: Entity;
  alive: Set<Entity>;
  doomed: Entity[];

  transform: Map<Entity, Transform>;
  body: Map<Entity, Body>;
  health: Map<Entity, Health>;
  playerC: Map<Entity, PlayerC>;
  staffC: Map<Entity, StaffC>;
  internC: Map<Entity, InternC>;
  inspectorC: Map<Entity, InspectorC>;
  registrarC: Map<Entity, RegistrarC>;
  auditorC: Map<Entity, AuditorC>;
  chiefC: Map<Entity, ChiefC>;
  archivistC: Map<Entity, ArchivistC>;
  keeperC: Map<Entity, KeeperC>;
  commissionC: Map<Entity, CommissionC>;
  courierC: Map<Entity, CourierC>;
  propC: Map<Entity, PropC>;
  railC: Map<Entity, RailC>;
  stashC: Map<Entity, StashC>;
  ticketC: Map<Entity, TicketC>;
  counterC: Map<Entity, CounterC>;
  clerkC: Map<Entity, ClerkC>;
  fixtureC: Map<Entity, FixtureC>;
  bulletC: Map<Entity, BulletC>;
  drawC: Map<Entity, DrawC>;
}

export function createEntity(w: World): Entity {
  const e = w.nextEntity++;
  w.alive.add(e);
  profiler.countSpawn(1);
  return e;
}

/** Пометить на удаление. Реальное удаление — в flushDoomed в конце шага. */
export function destroyEntity(w: World, e: Entity): void {
  w.doomed.push(e);
}

/**
 * Все хранилища компонентов одним списком.
 *
 * Список здесь не для красоты: чистка сущностей делается в двух местах —
 * при смерти и при смене участка, — и пока каждое перечисляло хранилища
 * само, они разъезжались. Так и вышло: railC, archivistC, keeperC и
 * commissionC не удалялись при смерти вовсе. Рельсы копились мёртвыми
 * записями, а председательство комиссии могло перейти к убитому, и двое
 * живых становились неуязвимы навсегда.
 *
 * Новое хранилище добавляется сюда, и обе чистки подхватывают его сами.
 */
export function componentStores(w: World): Map<Entity, unknown>[] {
  return [
    w.transform,
    w.body,
    w.health,
    w.playerC,
    w.staffC,
    w.internC,
    w.inspectorC,
    w.registrarC,
    w.auditorC,
    w.chiefC,
    w.archivistC,
    w.keeperC,
    w.commissionC,
    w.courierC,
    w.propC,
    w.railC,
    w.stashC,
    w.ticketC,
    w.counterC,
    w.clerkC,
    w.fixtureC,
    w.bulletC,
    w.drawC,
  ] as Map<Entity, unknown>[];
}

export function flushDoomed(w: World): void {
  profiler.countDestroy(w.doomed.length);
  const stores = componentStores(w);
  for (const e of w.doomed) {
    w.alive.delete(e);
    for (const store of stores) store.delete(e);
  }
  w.doomed.length = 0;
}

export function entityCount(w: World): number {
  return w.alive.size;
}
