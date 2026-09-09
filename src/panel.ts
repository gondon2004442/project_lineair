/**
 * Панель крутилок. Своя, без библиотек.
 * Значения правятся на живую: системы читают TUNING каждый кадр.
 * Поля, помеченные onRestart, читаются при рождении сущностей —
 * такие требуют повтора забега по R.
 */
import {
  BASELINE,
  PANEL,
  PRESETS,
  applyTuning,
  getTuning,
  setTuning,
  snapshotTuning,
  type TuningField,
  type TuningPatch,
} from './tuning';

const STORAGE_PRESETS = 'lineair.presets.v1';
const STORAGE_CURRENT = 'lineair.current.v1';
const AUTOSAVE_DELAY_MS = 400;

export interface PanelHooks {
  /** Панель просит начать забег заново (смена пресета, сброс). */
  restart(): void;
  /** Панель показана или скрыта — область холста изменилась. */
  resize(): void;
}

export interface Panel {
  /** Снять пометку «требуется повтор» — забег начат заново. */
  clearRestartFlag(): void;
}

interface Row {
  field: TuningField;
  input: HTMLInputElement;
  value: HTMLElement;
}

export function createPanel(host: HTMLElement, hooks: PanelHooks): Panel {
  const rows: Row[] = [];
  let restartNeeded = false;
  let autosaveTimer = 0;

  host.classList.add('panel');
  host.innerHTML = '';

  // --- Шапка --------------------------------------------------------------
  const header = el('div', 'panel-head');
  const title = el('div', 'panel-title');
  title.textContent = 'НАСТРОЙКА ОЩУЩЕНИЯ';
  const hint = el('div', 'panel-hint');
  hint.textContent = '` — СКРЫТЬ';
  header.append(title, hint);

  const presetSelect = document.createElement('select');
  presetSelect.className = 'panel-select';

  const loadButton = button('ЗАГРУЗИТЬ');
  const deleteButton = button('УДАЛИТЬ');
  const presetRow = el('div', 'panel-controls');
  presetRow.append(presetSelect, loadButton, deleteButton);

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'panel-text';
  nameInput.placeholder = 'ИМЯ ПРЕСЕТА';
  const saveButton = button('СОХРАНИТЬ');
  const saveRow = el('div', 'panel-controls');
  saveRow.append(nameInput, saveButton);

  const resetButton = button('СБРОС К БАЗЕ');
  const dumpButton = button('В КОНСОЛЬ');
  const toolRow = el('div', 'panel-controls');
  toolRow.append(resetButton, dumpButton);

  const status = el('div', 'panel-status');
  const warning = el('div', 'panel-warning');
  warning.textContent = 'ИЗМЕНЕНО ПОЛЕ, ЧИТАЕМОЕ ПРИ СТАРТЕ — НУЖЕН [R]';
  warning.hidden = true;

  host.append(header, presetRow, saveRow, toolRow, status, warning);

  // --- Крутилки -----------------------------------------------------------
  for (const group of PANEL) {
    const section = el('div', 'panel-group');
    const groupTitle = el('div', 'panel-group-title');
    groupTitle.textContent = group.title;
    const body = el('div', 'panel-group-body');
    groupTitle.addEventListener('click', () => {
      body.hidden = !body.hidden;
      groupTitle.classList.toggle('collapsed', body.hidden);
    });
    section.append(groupTitle, body);

    for (const field of group.fields) {
      const row = el('div', 'panel-row');
      const head = el('div', 'panel-row-head');
      const label = el('span', 'panel-label');
      label.textContent = field.label + (field.onRestart === true ? ' *' : '');
      label.title = field.path + ' — двойной щелчок вернёт базовое значение';
      const value = el('span', 'panel-value');
      head.append(label, value);

      const input = document.createElement('input');
      input.type = 'range';
      input.className = 'panel-slider';
      input.min = String(field.min);
      input.max = String(field.max);
      input.step = String(field.step);
      input.value = String(getTuning(field.path));

      input.addEventListener('input', () => {
        commit(field, Number(input.value));
      });
      label.addEventListener('dblclick', () => {
        const base = BASELINE[field.path];
        if (base === undefined) return;
        input.value = String(base);
        commit(field, base);
      });

      row.append(head, input);
      body.append(row);
      rows.push({ field, input, value });
    }
    host.append(section);
  }

  // --- Логика -------------------------------------------------------------
  function commit(field: TuningField, next: number): void {
    setTuning(field.path, next);
    if (field.onRestart === true) setRestartNeeded(true);
    refreshValues();
    markCustom();
    scheduleAutosave();
  }

  function refreshValues(): void {
    for (const row of rows) {
      const current = getTuning(row.field.path);
      row.input.value = String(current);
      row.value.textContent = format(current, row.field.step);
      const base = BASELINE[row.field.path];
      row.value.classList.toggle('changed', base !== undefined && base !== current);
    }
  }

  function setRestartNeeded(next: boolean): void {
    restartNeeded = next;
    warning.hidden = !next;
  }

  function markCustom(): void {
    status.textContent = 'ТЕКУЩИЕ: СВОИ ЗНАЧЕНИЯ';
  }

  function scheduleAutosave(): void {
    window.clearTimeout(autosaveTimer);
    autosaveTimer = window.setTimeout(() => {
      writeStorage(STORAGE_CURRENT, snapshotTuning());
    }, AUTOSAVE_DELAY_MS);
  }

  function userPresets(): Record<string, TuningPatch> {
    return readStorage(STORAGE_PRESETS) ?? {};
  }

  function rebuildPresetList(selected?: string): void {
    presetSelect.innerHTML = '';
    const builtin = document.createElement('optgroup');
    builtin.label = 'ВСТРОЕННЫЕ';
    for (const name of Object.keys(PRESETS)) builtin.append(option(name));
    presetSelect.append(builtin);

    const saved = Object.keys(userPresets());
    if (saved.length > 0) {
      const mine = document.createElement('optgroup');
      mine.label = 'СВОИ';
      for (const name of saved) mine.append(option(name));
      presetSelect.append(mine);
    }
    if (selected !== undefined) presetSelect.value = selected;
  }

  function loadPreset(name: string): void {
    const patch = PRESETS[name] ?? userPresets()[name];
    if (patch === undefined) return;
    // Пресет — это дельта от базы: сначала база, потом правки.
    applyTuning(BASELINE);
    applyTuning(patch);
    refreshValues();
    status.textContent = `ТЕКУЩИЕ: ${name.toUpperCase()}`;
    writeStorage(STORAGE_CURRENT, snapshotTuning());
    setRestartNeeded(false);
    hooks.restart();
  }

  loadButton.addEventListener('click', () => loadPreset(presetSelect.value));

  saveButton.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (name === '') {
      status.textContent = 'ИМЯ ПРЕСЕТА ПУСТОЕ';
      return;
    }
    if (name in PRESETS) {
      status.textContent = 'ЭТО ИМЯ ЗАНЯТО ВСТРОЕННЫМ ПРЕСЕТОМ';
      return;
    }
    const all = userPresets();
    all[name] = snapshotTuning();
    writeStorage(STORAGE_PRESETS, all);
    nameInput.value = '';
    rebuildPresetList(name);
    status.textContent = `СОХРАНЕНО: ${name.toUpperCase()}`;
  });

  deleteButton.addEventListener('click', () => {
    const name = presetSelect.value;
    if (name in PRESETS) {
      status.textContent = 'ВСТРОЕННЫЙ ПРЕСЕТ НЕ УДАЛЯЕТСЯ';
      return;
    }
    const all = userPresets();
    if (!(name in all)) return;
    delete all[name];
    writeStorage(STORAGE_PRESETS, all);
    rebuildPresetList();
    status.textContent = `УДАЛЁН: ${name.toUpperCase()}`;
  });

  resetButton.addEventListener('click', () => {
    applyTuning(BASELINE);
    refreshValues();
    writeStorage(STORAGE_CURRENT, snapshotTuning());
    status.textContent = 'ТЕКУЩИЕ: БАЗА';
    setRestartNeeded(false);
    hooks.restart();
  });

  dumpButton.addEventListener('click', () => {
    const patch = snapshotTuning();
    const delta: TuningPatch = {};
    for (const [path, value] of Object.entries(patch)) {
      if (BASELINE[path] !== value) delta[path] = value;
    }
    // Готово к вставке в PRESETS внутри src/tuning.ts.
    console.log(JSON.stringify(delta, null, 2));
    status.textContent = `В КОНСОЛИ: ${Object.keys(delta).length} ОТЛИЧИЙ ОТ БАЗЫ`;
  });

  window.addEventListener('keydown', (ev) => {
    if (ev.code !== 'Backquote') return;
    if (isPanelTarget(ev.target)) return;
    ev.preventDefault();
    host.hidden = !host.hidden;
    document.body.classList.toggle('panel-open', !host.hidden);
    hooks.resize();
  });

  // --- Стартовое состояние ------------------------------------------------
  rebuildPresetList();
  const restored = readStorage<TuningPatch>(STORAGE_CURRENT);
  if (restored !== null) {
    applyTuning(restored);
    status.textContent = 'ТЕКУЩИЕ: ВОССТАНОВЛЕНЫ ИЗ ПРОШЛОГО СЕАНСА';
  } else {
    status.textContent = 'ТЕКУЩИЕ: БАЗА';
  }
  refreshValues();
  document.body.classList.add('panel-open');

  return {
    clearRestartFlag() {
      if (restartNeeded) setRestartNeeded(false);
    },
  };
}

/** Событие пришло из панели — игра не должна на него реагировать. */
export function isPanelTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('.panel') !== null;
}

function el(tag: string, className: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function button(text: string): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = 'panel-button';
  node.textContent = text;
  return node;
}

function option(name: string): HTMLOptionElement {
  const node = document.createElement('option');
  node.value = name;
  node.textContent = name.toUpperCase();
  return node;
}

function format(value: number, step: number): string {
  const digits = Math.max(0, Math.ceil(-Math.log10(step)));
  return value.toFixed(digits);
}

function readStorage<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Хранилище недоступно — молча работаем без сохранения.
  }
}
