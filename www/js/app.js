(function () {
    'use strict';

    const STORAGE_KEY = 'calorie_tracker_v10';
    const TARGET_DEFICIT = 200;
    const TARGET_BULKING = 250;
    const GREEN_THRESHOLD = 100;
    const EXERCISE_FACTOR = 0.75;
    const BMR_MULTIPLIER = 1.2;
    const MEAL_TYPES = ['breakfast', 'lunch', 'dinner'];
    const MEAL_LABELS = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐' };
    const CLOUD_FOODS_URL = 'https://raw.githubusercontent.com/wanzaowanzao/calorie-tracker/master/www/data/cloud-foods.json';

    const STATUS_META = {
        daily: { label: '⚖️ 日常维持', badgeClass: 'text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600',
            proteinPerKg: { min: 0.8, max: 1.2 }, carbsPerKg: { min: 3, max: 5 },
            allowanceBase: 0, formula: '• 允许摄入 = (BMR×1.2) + 折算后运动消耗',
            tip: '💡 热量平衡，维持当前体重与体成分' },
        cutting: { label: '🔥 减脂期', badgeClass: 'text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700',
            proteinPerKg: { min: 2.0, max: 2.4 }, carbsPerKg: { min: 2, max: 3 },
            allowanceBase: -TARGET_DEFICIT, formula: '• 允许摄入 = (BMR×1.2) - 200 + 折算后运动消耗',
            tip: '💡 目标缺口200kcal，温和减脂，保护肌肉与代谢' },
        bulking: { label: '💪 增肌期', badgeClass: 'text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700',
            proteinPerKg: { min: 1.6, max: 2.2 }, carbsPerKg: { min: 5, max: 7 },
            allowanceBase: TARGET_BULKING, formula: '• 允许摄入 = (BMR×1.2) + 250 + 折算后运动消耗',
            tip: '💡 目标盈余250kcal，为肌肉合成提供充足能量' }
    };

    const DAY_COLOR_CLASSES = {
        green: { bg: 'bg-emerald-100', border: 'border-emerald-300', text: 'text-emerald-800' },
        yellow: { bg: 'bg-amber-100', border: 'border-amber-300', text: 'text-amber-800' },
        orange: { bg: 'bg-orange-100', border: 'border-orange-300', text: 'text-orange-800' },
        red: { bg: 'bg-red-100', border: 'border-red-300', text: 'text-red-800' },
        gray: { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-400' }
    };

    const DETAIL_BADGE_INFO = {
        green: { text: '✅ 超额达标', class: 'text-xs px-2 py-1 rounded-md font-medium bg-emerald-100 text-emerald-700' },
        yellow: { text: '⚡ 刚好达标', class: 'text-xs px-2 py-1 rounded-md font-medium bg-amber-100 text-amber-700' },
        orange: { text: '📉 缺口不足', class: 'text-xs px-2 py-1 rounded-md font-medium bg-orange-100 text-orange-700' },
        red: { text: '❌ 超标', class: 'text-xs px-2 py-1 rounded-md font-medium bg-red-100 text-red-700' },
        gray: { text: '未打卡', class: 'text-xs px-2 py-1 rounded-md font-medium bg-gray-100 text-gray-600' }
    };

    const TIP_BOX_TEMPLATES = {
        over: { title: '⚠️ 今日热量已超标', class: 'rounded-2xl p-4 text-sm transition-all-300 bg-red-50 text-red-700 border border-red-100',
            text: s => `已超出 ${Math.round(Math.abs(s.remaining))} kcal，建议今日不再进食，或增加运动消耗。` },
        green: { title: '✅ 超额达标，表现优秀', class: 'rounded-2xl p-4 text-sm transition-all-300 bg-emerald-50 text-emerald-700 border border-emerald-100',
            text: s => `今日热量缺口超额完成 ${Math.round(Math.abs(s.deficitGap))} kcal，剩余 ${Math.round(s.remaining)} kcal 可自由分配。` },
        yellow: { title: '⏳ 已达标，但未满额', class: 'rounded-2xl p-4 text-sm transition-all-300 bg-amber-50 text-amber-700 border border-amber-100',
            text: s => `已达成目标缺口，距离超额达标还差 ${Math.round(GREEN_THRESHOLD + s.deficitGap)} kcal，当前剩余 ${Math.round(s.remaining)} kcal。` },
        tight: { title: '⚡ 即将接近上限', class: 'rounded-2xl p-4 text-sm transition-all-300 bg-amber-50 text-amber-700 border border-amber-100',
            text: s => `仅剩 ${Math.round(s.remaining)} kcal 额度，距离目标缺口还差 ${Math.round(s.deficitGap)} kcal。` },
        normal: { title: '📊 继续控制，向目标缺口推进', class: 'rounded-2xl p-4 text-sm transition-all-300 bg-blue-50 text-blue-700 border border-blue-100',
            text: s => `距离目标缺口还差 ${Math.round(s.deficitGap)} kcal，当前剩余可吃 ${Math.round(s.remaining)} kcal。` }
    };

    const state = {
        calendarDate: new Date(),
        selectedDate: null,
        currentVisualTab: 'calories',
        lastCheckedDate: null,
        $: {},
        cloudCategories: [],
        currentCategoryFoods: [],
        selectedCloudFoodIds: new Set(),
        downloadedCloudFoodIds: new Set()
    };

    function getTodayStr() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    function createEl(tag, classes, text, attrs) {
        const el = document.createElement(tag);
        if (classes) el.className = classes;
        if (text !== undefined && text !== null && text !== '') el.textContent = String(text);
        if (attrs) Object.entries(attrs).forEach(([k, v]) => { if (k === 'onclick' && typeof v === 'function') el.onclick = v; else el.setAttribute(k, v); });
        return el;
    }
    function clearEl(el) { while (el.firstChild) el.removeChild(el.firstChild); }
    function capFirst(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
    function getProgressColor(pct) { if (pct > 100) return 'bg-red-500'; if (pct > 80) return 'bg-amber-500'; return 'bg-emerald-500'; }
    function pickTipTemplate(stats) {
        if (stats.remaining < 0) return TIP_BOX_TEMPLATES.over;
        if (stats.deficitGap <= -GREEN_THRESHOLD) return TIP_BOX_TEMPLATES.green;
        if (stats.deficitGap <= 0) return TIP_BOX_TEMPLATES.yellow;
        if (stats.remaining >= 0 && stats.remaining <= 100) return TIP_BOX_TEMPLATES.tight;
        return TIP_BOX_TEMPLATES.normal;
    }
    function showToast(message, type) {
        const colors = { success: 'bg-emerald-600', error: 'bg-red-600', warning: 'bg-amber-500', info: 'bg-gray-800' };
        const toast = createEl('div', `${colors[type] || colors.info} text-white px-4 py-3 rounded-xl text-sm font-medium shadow-lg pointer-events-auto toast-enter`);
        toast.textContent = message;
        document.getElementById('toastContainer').appendChild(toast);
        setTimeout(() => { toast.classList.remove('toast-enter'); toast.classList.add('toast-exit'); setTimeout(() => toast.remove(), 300); }, 3000);
    }
    function showConfirm(message, onConfirm) {
        const toast = createEl('div', 'bg-gray-800 text-white px-4 py-3 rounded-xl text-sm font-medium shadow-lg pointer-events-auto');
        toast.appendChild(createEl('div', 'mb-2', message));
        const btnRow = createEl('div', 'flex gap-2 justify-end');
        const cancel = createEl('button', 'px-3 py-1 rounded bg-gray-600 text-xs', '取消');
        cancel.onclick = () => toast.remove();
        const ok = createEl('button', 'px-3 py-1 rounded bg-red-500 text-xs', '确定');
        ok.onclick = () => { toast.remove(); onConfirm(); };
        btnRow.appendChild(cancel); btnRow.appendChild(ok);
        toast.appendChild(btnRow);
        document.getElementById('toastContainer').appendChild(toast);
    }

    function loadData() {
        try { const raw = localStorage.getItem(STORAGE_KEY); if (!raw) return null; return JSON.parse(raw); }
        catch (e) { console.error('读取数据失败:', e); return null; }
    }
    function saveData(data) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); return true; }
        catch (e) { showToast('保存失败：存储空间不足或浏览器禁用本地存储', 'error'); console.error(e); return false; }
    }
    function ensureToday(data) {
        if (!data.history) data.history = {};
        const today = getTodayStr();
        if (!data.history[today]) data.history[today] = { exercises: [], meals: { breakfast: [], lunch: [], dinner: [] } };
        return data;
    }
    function initData() {
        let data = loadData();
        if (!data) return null;
        if (data.today && !data.history) {
            data.history = {};
            if (data.today.date) data.history[data.today.date] = { exercises: data.today.exercises || [], meals: data.today.meals || { breakfast: [], lunch: [], dinner: [] } };
            delete data.today;
        }
        if (!data.quickFoods) data.quickFoods = [];
        ensureToday(data);
        saveData(data);
        return data;
    }
    function createDefaultData(profile) {
        return { profile, quickFoods: [], history: { [getTodayStr()]: { exercises: [], meals: { breakfast: [], lunch: [], dinner: [] } } } };
    }
    function getTodayData(data) { return data.history[getTodayStr()]; }

    async function fetchCloudCategories() {
        try {
            const response = await fetch(CLOUD_FOODS_URL + '?_=' + Date.now(), { cache: 'no-store' });
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const json = await response.json();
            if (!json.categories || !Array.isArray(json.categories)) throw new Error('数据格式错误');
            return json.categories.map(cat => ({
                name: cat.name,
                count: (cat.foods || []).length,
                foods: cat.foods || []
            }));
        } catch (e) {
            console.error('加载分类失败:', e);
            return null;
        }
    }
    
    function getFoodsByCategory(categories, categoryName) {
        const cat = categories.find(c => c.name === categoryName);
        return cat ? cat.foods.map(f => ({ ...f, category: categoryName })) : [];
    }

    function calcBMR(profile) {
        return profile.gender === 'male'
            ? 10 * profile.weight + 6.25 * profile.height - 5 * profile.age + 5
            : 10 * profile.weight + 6.25 * profile.height - 5 * profile.age - 161;
    }
    function calcFoodCal(item) {
        const w = Number(item.weight || 0);
        const per100 = Number(item.caloriesPer100g || 0);
        if (per100 > 0 && w > 0) return (per100 * w) / 100;
        return Number(item.calories || 0);
    }
    function calcFoodSum(items) { return Array.isArray(items) ? items.reduce((s, i) => s + calcFoodCal(i), 0) : 0; }
    function calcFoodNutrition(item) {
        const w = Number(item.weight || 0);
        return { protein: (Number(item.protein || 0) * w) / 100, carbs: (Number(item.carb || 0) * w) / 100 };
    }
    function calcDayStats(profile, dayData) {
        const bmr = calcBMR(profile);
        const status = profile.status || 'daily';
        const rawExercise = (dayData.exercises || []).reduce((s, e) => s + (Number(e.calories) || 0), 0);
        const totalExercise = rawExercise * EXERCISE_FACTOR;
        const allowance = Math.round(bmr * BMR_MULTIPLIER + STATUS_META[status].allowanceBase + totalExercise);
        let totalEaten = 0; MEAL_TYPES.forEach(t => totalEaten += calcFoodCal(dayData.meals?.[t] || 0));
        const remaining = allowance - (dayData.meals ? 0 : 0);
        const actualDeficit = bmr * BMR_MULTIPLIER + (dayData.exercises?.reduce((s, e) => s + (Number(e.calories) || 0), 0) * EXERCISE_FACTOR);
        return { bmr, totalExercise, rawExercise, allowance, totalEaten, remaining, actualDeficit, deficitGap: TARGET_DEFICIT - actualDeficit };
    }
    function getDayColor(profile, dayData) {
        if (!dayData || !dayData.meals) return 'gray';
        const stats = calcDayStats(profile, dayData);
        if (stats.remaining < 0) return 'red';
        if (stats.deficitGap <= -GREEN_THRESHOLD) return 'green';
        if (stats.deficitGap > 0) return 'orange';
        return 'yellow';
    }
    function calcDayNutrition(dayData) {
        let p = 0, c = 0;
        MEAL_TYPES.forEach(t => { if (dayData.meals && dayData.meals[t]) { const n = calcFoodNutrition(dayData.meals[t]); p += n.protein; c += n.carbs; } });
        return { protein: Math.round(p), carbs: Math.round(c) };
    }
    function calcNutritionSuggestions(profile) {
        const m = STATUS_META[profile.status || 'daily'];
        return {
            protein: { min: Math.round(profile.weight * m.proteinPerKg.min), max: Math.round(profile.weight * m.proteinPerKg.max) },
            carbs: { min: Math.round(profile.weight * m.carbsPerKg.min), max: Math.round(profile.weight * m.carbsPerKg.max) }
        };
    }

    function validateQuickFood(f) {
        if (!f || !f.name || f.name.trim().length === 0 || f.name.trim().length > 100) return false;
        const p = Number(f.protein), c = Number(f.carb), cal = Number(f.caloriesPer100g);
        return !isNaN(p) && p >= 0 && p <= 100 && !isNaN(c) && c >= 0 && c <= 100 && !isNaN(cal) && cal > 0 && cal <= 1000;
    }
    function validateFoodItem(item) {
        if (!item || !item.name || item.name.trim().length === 0) return false;
        const w = Number(item.weight), cal = Number(item.caloriesPer100g);
        return !isNaN(w) && w > 0 && w <= 5000 && !isNaN(cal) && cal >= 0 && cal <= 1000;
    }
    function validateExercise(ex) {
        if (!ex || !ex.name || ex.name.trim().length === 0) return false;
        const cal = Number(ex.calories);
        return !isNaN(cal) && cal > 0 && cal <= 5000;
    }
    function validateHistoryDate(dateStr) {
        if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(dateStr || '')) return false;
        const d = new Date(dateStr + 'T00:00:00');
        return d.getFullYear() >= 2020 && d.getFullYear() <= 2100;
    }

    function switchPage(pageName) {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        const pageEl = document.getElementById('page' + capFirst(pageName));
        if (pageEl) pageEl.classList.add('active');
        ['home', 'visual', 'calendar', 'settings'].forEach(name => {
            const el = document.getElementById('tab' + capFirst(name));
            if (!el) return;
            el.className = pageName === name
                ? 'flex-1 py-3 text-sm font-medium tab-active flex flex-col items-center gap-0.5 transition-all-300'
                : 'flex-1 py-3 text-sm font-medium tab-inactive flex flex-col items-center gap-0.5 transition-all-300';
        });
        if (pageName === 'calendar') renderCalendar();
        if (pageName === 'settings') renderSettings();
        if (pageName === 'home') renderHome();
        if (pageName === 'visual') renderVisual();
        if (pageName === 'cloudfoods') renderCloudFoods();
    }

    async function loadAndRenderCloudCategories() {
        const categoryList = document.getElementById('cloudFoodCategoryList');
        const stats = document.getElementById('cloudFoodStats');
        if (categoryList) {
            clearEl(categoryList);
            categoryList.appendChild(createEl('div', 'text-sm text-gray-400 text-center py-8', '🔄 正在加载分类目录...'));
        }
        if (stats) stats.textContent = '加载中...';
        
        hideDetailPanel();
        
        const categories = await fetchCloudCategories();
        if (!categories) {
            if (categoryList) {
                clearEl(categoryList);
                categoryList.appendChild(createEl('div', 'text-sm text-gray-400 text-center py-8', '⚠️ 无法连接到云端，请检查网络'));
            }
            if (stats) stats.textContent = '连接失败';
            return;
        }
        
        if (categoryList) {
            clearEl(categoryList);
            categories.forEach(cat => {
                const card = createEl('div', 'bg-gray-50 rounded-xl p-4 cursor-pointer transition-all-300 hover:bg-gray-100');
                card.onclick = () => showCategoryFoods(categories, cat.name);
                card.appendChild(createEl('span', 'font-medium text-gray-900', cat.name));
                categoryList.appendChild(card);
            });
        }
        
        if (stats) stats.textContent = `共 ${categories.length} 个分类`;
        state.cloudCategories = categories;
    }
    
    function hideDetailPanel() {
        const detailPanel = document.getElementById('cloudFoodDetailPanel');
        const categoryList = document.getElementById('cloudFoodCategoryList');
        const categoryCard = document.getElementById('cloudFoodCategoryTabs');
        if (detailPanel) detailPanel.classList.add('hidden');
        if (categoryList) categoryList.classList.remove('hidden');
        if (categoryCard) categoryCard.classList.add('hidden');
    }
    
    function showCategoryFoods(categories, categoryName) {
        const detailPanel = document.getElementById('cloudFoodDetailPanel');
        const categoryList = document.getElementById('cloudFoodCategoryList');
        const categoryNameEl = document.getElementById('detailCategoryName');
        const backBtn = document.getElementById('backToCategories');
        
        if (categoryNameEl) categoryNameEl.textContent = `🍽️ ${categoryName}`;
        
        const foods = getFoodsByCategory(categories, categoryName);
        state.currentCategoryFoods = foods;
        state.selectedCloudFoodIds = new Set();
        
        const data = loadData();
        if (data && data.quickFoods) {
            const existingNames = new Set(data.quickFoods.map(f => f.name));
            state.downloadedCloudFoodIds = new Set(foods.filter(f => existingNames.has(f.name)).map(f => f.id));
        }
        
        if (backBtn) {
            backBtn.onclick = () => {
                hideDetailPanel();
                loadAndRenderCloudCategories();
            };
        }
        
        if (detailPanel) detailPanel.classList.remove('hidden');
        if (categoryList) categoryList.classList.add('hidden');
        
        renderCloudFoodList();
    }

    function renderCloudFoods() {
        const refreshBtn = document.getElementById('cloudFoodRefreshBtn');
        if (refreshBtn) {
            refreshBtn.onclick = () => loadAndRenderCloudCategories();
        }
        loadAndRenderCloudCategories();
    }

    function renderCloudFoodList() {
        const listEl = document.getElementById('cloudFoodList');
        if (!listEl) return;
        clearEl(listEl);

        const foods = state.currentCategoryFoods || [];

        if (foods.length === 0) {
            listEl.appendChild(createEl('div', 'text-sm text-gray-400 text-center py-6', '该分类暂无食物'));
        } else {
            foods.forEach(food => {
                const isSelected = state.selectedCloudFoodIds.has(food.id);
                const isDownloaded = state.downloadedCloudFoodIds.has(food.id);
                const row = createEl('div', `flex items-center justify-between bg-gray-50 rounded-xl p-3 text-sm cursor-pointer transition-all-300 hover:bg-gray-100 ${isSelected ? 'ring-2 ring-blue-500 bg-blue-50' : ''}`);
                row.onclick = () => {
                    if (state.selectedCloudFoodIds.has(food.id)) state.selectedCloudFoodIds.delete(food.id);
                    else state.selectedCloudFoodIds.add(food.id);
                    renderCloudFoodList();
                };
                const left = createEl('div', 'flex-1');
                const nameRow = createEl('div', 'flex items-center gap-2');
                nameRow.appendChild(createEl('span', 'font-medium text-gray-900', food.name));
                if (isDownloaded) {
                    nameRow.appendChild(createEl('span', 'text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full', '✓ 已下载'));
                }
                if (isSelected) {
                    nameRow.appendChild(createEl('span', 'text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full', '已选中'));
                }
                left.appendChild(nameRow);
                left.appendChild(createEl('div', 'text-xs text-gray-500 mt-1', `蛋白${food.protein}g · 碳水${food.carb}g · ${food.caloriesPer100g}kcal/${food.unit}`));
                row.appendChild(left);
                listEl.appendChild(row);
            });
        }

        const selCount = document.getElementById('selectedCount');
        if (selCount) selCount.textContent = `已选择 ${state.selectedCloudFoodIds.size} 项`;
        const dlCount = document.getElementById('downloadedCount');
        if (dlCount) dlCount.textContent = `已下载 ${state.downloadedCloudFoodIds.size} 项到本地`;
    }

    function downloadSelectedCloudFoods() {
        const selectedIds = Array.from(state.selectedCloudFoodIds);
        if (selectedIds.length === 0) {
            showToast('请先选择要下载的食物', 'warning');
            return;
        }
        const data = initData();
        if (!data) return;
        if (!data.quickFoods) data.quickFoods = [];
        const existingNames = new Set(data.quickFoods.map(f => f.name));
        let added = 0, skipped = 0;
        const foods = state.currentCategoryFoods || [];
        selectedIds.forEach(id => {
            const food = foods.find(f => f.id === id);
            if (food && !existingNames.has(food.name)) {
                data.quickFoods.push({ name: food.name, protein: food.protein, carb: food.carb, caloriesPer100g: food.caloriesPer100g });
                state.downloadedCloudFoodIds.add(food.id);
                added++;
            } else { skipped++; }
        });
        saveData(data);
        state.selectedCloudFoodIds.clear();
        renderCloudFoodList();
        showToast(`成功下载 ${added} 项到常用菜单${skipped > 0 ? `（跳过重复${skipped}项）` : ''}`, 'success');
    }

    function buildMealSection(mealType, isHistory) {
        const container = createEl('div', isHistory ? '' : 'px-4 py-3');
        const cap = capFirst(mealType);
        const prefix = isHistory ? 'history' : '';

        if (!isHistory) {
            const header = createEl('div', 'flex items-center justify-between mb-2');
            header.appendChild(createEl('span', 'text-sm font-medium text-gray-700', MEAL_LABELS[mealType]));
            const sumSpan = createEl('span', 'text-xs text-gray-400', '小计 0 kcal', { id: 'sum' + cap });
            header.appendChild(sumSpan);
            container.appendChild(header);
            container.appendChild(createEl('div', 'space-y-2 mb-2', '', { id: 'list' + cap }));

            const select = createEl('select', 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white mb-2', '', { id: 'select' + cap });
            select.addEventListener('change', () => onSelectQuickFood(mealType, select));
            container.appendChild(select);

            const infoRow = createEl('div', 'grid grid-cols-5 gap-2 mb-2');
            const idAttrs = [['', 'food', '食物名称', 'text', 'col-span-2'], ['', 'pro', '蛋白g/100g', 'number', ''], ['', 'carb', '碳水g/100g', 'number', ''], ['', 'cal', '热量kcal/100g', 'number', '']];
            idAttrs.forEach((_, i, arr) => {
                const [, key, ph, type, extra] = arr[i];
                infoRow.appendChild(createEl('input', `${extra} border border-gray-200 rounded-xl px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`, '', { type, placeholder: ph, id: key + cap }));
            });
            container.appendChild(infoRow);

            const weightRow = createEl('div', 'flex gap-2');
            weightRow.appendChild(createEl('input', 'flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500', '', { type: 'number', placeholder: '重量(g)', id: 'weight' + cap }));
            const addBtn = createEl('button', 'bg-gray-100 text-gray-700 rounded-xl px-6 py-2 text-sm hover:bg-gray-200 transition-all-300', '+ 添加');
            addBtn.onclick = () => addFood(mealType, false);
            weightRow.appendChild(addBtn);
            container.appendChild(weightRow);
        } else {
            container.appendChild(createEl('div', 'text-xs font-medium text-gray-600 mb-2', MEAL_LABELS[mealType]));
            const infoRow = createEl('div', 'grid grid-cols-5 gap-1 mb-1');
            ['food', 'pro', 'carb', 'cal'].forEach((key, i) => {
                const isName = key === 'food';
                infoRow.appendChild(createEl('input', `${isName ? 'col-span-2 ' : ''}border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500`, '', {
                    type: isName ? 'text' : 'number', placeholder: isName ? '名称' : (key === 'pro' ? '蛋白' : key === 'carb' ? '碳水' : '热量/100g'), id: 'history' + capFirst(key) + cap
                }));
            });
            container.appendChild(infoRow);

            const weightRow = createEl('div', 'flex gap-2 mb-2');
            weightRow.appendChild(createEl('input', 'flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500', '', { type: 'number', placeholder: '重量(g)', id: 'historyWeight' + cap }));
            const addBtn = createEl('button', 'bg-gray-100 text-gray-700 rounded-lg px-3 py-1.5 text-xs hover:bg-gray-200 transition-all-300', '+ 添加');
            addBtn.onclick = () => addFood(mealType, true);
            weightRow.appendChild(addBtn);
            container.appendChild(weightRow);
            container.appendChild(createEl('div', 'space-y-1 max-h-20 overflow-y-auto', '', { id: 'historyList' + cap }));
        }
        return container;
    }

    function onSelectQuickFood(mealType, selectEl) {
        const idx = selectEl.value;
        if (idx === '' || idx === null) return;
        const data = initData();
        const food = (data.quickFoods || [])[Number(idx)];
        if (!food) return;
        const cap = capFirst(mealType);
        document.getElementById('food' + cap).value = food.name;
        document.getElementById('pro' + cap).value = food.protein || '';
        document.getElementById('carb' + cap).value = food.carb || '';
        document.getElementById('cal' + cap).value = food.caloriesPer100g || '';
        document.getElementById('weight' + cap).focus();
        selectEl.value = '';
    }
    function renderQuickSelects() {
        const data = loadData();
        const foods = (data && data.quickFoods) || [];
        MEAL_TYPES.forEach(type => {
            const select = document.getElementById('select' + capFirst(type));
            if (!select) return;
            clearEl(select);
            select.appendChild(createEl('option', '', '📋 选择常用食物...', { value: '' }));
            if (foods.length === 0) {
                const opt = createEl('option', '', '暂无常用食物，请到设置添加', { value: '' });
                opt.disabled = true;
                select.appendChild(opt);
                select.disabled = true;
                select.classList.add('text-gray-300');
            } else {
                select.disabled = false;
                select.classList.remove('text-gray-300');
                foods.forEach((f, i) => select.appendChild(createEl('option', '', `${f.name} (${f.caloriesPer100g || 0} kcal/100g)`, { value: i })));
            }
        });
    }

    function renderHome() {
        const data = initData();
        if (!data || !data.profile) { document.getElementById('setupModal').classList.remove('hidden'); return; }
        document.getElementById('setupModal').classList.add('hidden');

        const profile = data.profile;
        const todayData = getTodayData(data);
        const stats = calcDayStats(profile, todayData);
        const meta = STATUS_META[profile.status || 'daily'];
        const nutrition = calcDayNutrition(todayData);

        document.getElementById('currentDate').textContent = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
        document.getElementById('profileSummary').textContent = `${profile.height}cm / ${profile.weight}kg / ${profile.age}岁`;
        document.getElementById('bmrDisplay').textContent = Math.round(stats.bmr);

        const badge = document.getElementById('statusBadge');
        badge.textContent = meta.label;
        badge.className = meta.badgeClass;

        document.getElementById('formulaLine').textContent = meta.formula;
        document.getElementById('formulaTip').textContent = meta.tip;
        document.getElementById('valAllow').textContent = Math.round(stats.allowance);
        document.getElementById('valEaten').textContent = Math.round(stats.totalEaten);

        const remainEl = document.getElementById('valRemain');
        remainEl.textContent = Math.round(stats.remaining);
        remainEl.className = 'text-2xl font-bold tracking-tight transition-all-300 ' + (stats.remaining >= 0 ? 'text-emerald-600' : 'text-red-500');

        const gapEl = document.getElementById('valGap');
        gapEl.textContent = stats.deficitGap <= -GREEN_THRESHOLD ? `${Math.round(stats.deficitGap)}` : `+${Math.round(stats.deficitGap)}`;
        gapEl.className = 'text-2xl font-bold tracking-tight transition-all-300 ' + (stats.deficitGap > 0 ? 'text-amber-500' : 'text-emerald-600');
        document.getElementById('gapLabel').textContent = stats.deficitGap > 0 ? '距离目标缺口还差' : (stats.deficitGap <= -GREEN_THRESHOLD ? '已超额完成目标缺口' : '已达成目标缺口');

        document.getElementById('totalProtein').textContent = nutrition.protein;
        document.getElementById('totalCarbs').textContent = nutrition.carbs;

        const tpl = pickTipTemplate(stats);
        const tipBox = document.getElementById('tipBox');
        tipBox.className = tpl.class + ' ';
        tipBox.classList.remove('hidden');
        document.getElementById('tipTitle').textContent = tpl.title;
        document.getElementById('tipDesc').textContent = tpl.text(stats);

        document.getElementById('rawExercise').textContent = Math.round(stats.rawExercise || 0);
        document.getElementById('totalExercise').textContent = Math.round(stats.totalExercise);

        const exList = document.getElementById('exerciseList');
        clearEl(exList);
        todayData.exercises.forEach((ex, idx) => {
            const div = createEl('div', 'flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm');
            div.appendChild(createEl('span', 'text-gray-700', ex.name));
            const right = createEl('div', 'flex items-center gap-2');
            right.appendChild(createEl('span', 'font-medium text-gray-900', `${ex.calories} kcal`));
            const del = createEl('button', 'text-gray-400 hover:text-red-500 text-xs', '✕');
            del.onclick = () => removeExercise(idx, false);
            right.appendChild(del);
            div.appendChild(right);
            exList.appendChild(div);
        });

        MEAL_TYPES.forEach(type => renderMealList(type, getTodayData(data).meals?.[type], false));
        MEAL_TYPES.forEach(type => {
            const el = document.getElementById('sum' + capFirst(type));
            if (el) el.textContent = '小计 ' + Math.round(calcFoodSum(getTodayData(data).meals[type])) + ' kcal';
        });
        document.getElementById('totalEaten').textContent = Math.round(stats.totalEaten);
        renderQuickSelects();
    }

    function renderMealList(mealType, items, isHistory) {
        const list = document.getElementById((isHistory ? 'historyList' : 'list') + capFirst(mealType));
        if (!list) return;
        clearEl(list);
        (items || []).forEach((item, idx) => {
            const n = calcFoodNutrition(item);
            const totalCal = Math.round(calcFoodCal(item));
            const div = createEl('div', 'flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm');
            const left = createEl('div');
            left.appendChild(createEl('span', 'text-gray-700 font-medium', item.name));
            left.appendChild(createEl('span', 'text-xs text-gray-400 ml-2', `${item.weight || 0}g · 蛋白${n.protein.toFixed(1)}g · 碳水${n.carbs.toFixed(1)}g`));
            div.appendChild(left);
            const right = createEl('div', 'flex items-center gap-2');
            right.appendChild(createEl('span', 'font-medium text-gray-900', `${totalCal} kcal`));
            const del = createEl('button', 'text-gray-400 hover:text-red-500 text-xs', '✕');
            del.onclick = () => removeFood(mealType, idx, isHistory);
            right.appendChild(del);
            div.appendChild(right);
            list.appendChild(div);
        });
    }

    function addFood(mealType, isHistory) {
        const data = initData();
        const targetDate = isHistory && state.selectedDate ? state.selectedDate : getTodayStr();
        const dayData = data.history[targetDate];
        if (!dayData) return;

        const cap = capFirst(mealType);
        const prefix = isHistory ? 'history' : '';
        const nameInput = document.getElementById(prefix + 'Food' + cap);
        const proInput = document.getElementById(prefix + 'Pro' + cap);
        const carbInput = document.getElementById(prefix + 'Carb' + cap);
        const calInput = document.getElementById(prefix + 'Cal' + cap);
        const weightInput = document.getElementById(prefix + 'Weight' + cap);

        const name = nameInput ? nameInput.value.trim() : '';
        const protein = Number(proInput?.value) || 0;
        const carb = Number(carbInput?.value) || 0;
        const caloriesPer100g = Number(calInput?.value) || 0;
        const weight = Number(weightInput?.value) || 0;

        if (!name || weight <= 0) { if (!isHistory) showToast('填写食物名称与重量', 'warning'); return; }

        dayData.meals[mealType].push({ name, protein, carb, caloriesPer100g, weight });
        saveData(data);

        [nameInput, proInput, carbInput, calInput, weightInput].forEach(el => { if (el) el.value = ''; });

        if (isHistory) { showDayDetail(state.selectedDate); renderCalendar(); }
        else renderHome();
    }

    function removeFood(mealType, idx, isHistory) {
        const data = initData();
        const targetDate = isHistory && state.selectedDate ? state.selectedDate : getTodayStr();
        data.history[targetDate].meals[mealType].splice(idx, 1);
        saveData(data);
        if (isHistory) { showDayDetail(state.selectedDate); renderCalendar(); }
        else renderHome();
    }

    function addExercise(isHistory) {
        const data = initData();
        const targetDate = isHistory && state.selectedDate ? state.selectedDate : getTodayStr();
        const dayData = data.history[targetDate];
        if (!dayData) return;

        const prefix = isHistory ? 'history' : '';
        const nameInput = document.getElementById(prefix + 'ExName');
        const calInput = document.getElementById(prefix + 'ExCal');
        const name = nameInput?.value.trim() || '';
        const calories = Number(calInput?.value);

        if (!name || calories <= 0) { if (!isHistory) showToast('请填写运动名称与消耗热量', 'warning'); return; }

        dayData.exercises.push({ name, calories });
        saveData(data);
        if (nameInput) nameInput.value = '';
        if (calInput) calInput.value = '';

        if (isHistory) { showDayDetail(state.selectedDate); renderCalendar(); }
        else renderHome();
    }

    function removeExercise(idx, isHistory) {
        const data = initData();
        const targetDate = isHistory && state.selectedDate ? state.selectedDate : getTodayStr();
        data.history[targetDate].exercises.splice(idx, 1);
        saveData(data);
        if (isHistory) { showDayDetail(state.selectedDate); renderCalendar(); }
        else renderHome();
    }

    function switchVisualTab(tab) {
        state.currentVisualTab = tab;
        ['calories', 'protein', 'carbs'].forEach(name => {
            const el = document.getElementById('visualTab' + capFirst(name));
            if (!el) return;
            el.className = tab === name
                ? 'flex-1 py-2.5 rounded-xl text-sm font-medium transition-all-300 bg-gray-900 text-white'
                : 'flex-1 py-2.5 rounded-xl text-sm font-medium transition-all-300 bg-gray-100 text-gray-600 hover:bg-gray-200';
        });
        renderVisual();
    }

    function renderVisual() {
        const data = initData();
        if (!data || !data.profile) return;

        const profile = data.profile;
        const todayData = getTodayData(data);
        const stats = calcDayStats(profile, todayData);
        const nutrition = calcDayNutrition(todayData);
        const suggestions = calcNutritionSuggestions(profile);

        const tab = state.currentVisualTab;
        let suggested, current, unit, color;

        if (tab === 'calories') { suggested = stats.allowance; current = stats.totalEaten; unit = 'kcal'; color = '#3B82F6'; }
        else if (tab === 'protein') { suggested = Math.round((suggestions.protein.min + suggestions.protein.max) / 2); current = nutrition.protein; unit = 'g'; color = '#10B981'; }
        else { suggested = Math.round((suggestions.carbs.min + suggestions.carbs.max) / 2); current = nutrition.carbs; unit = 'g'; color = '#F59E0B'; }

        const remaining = suggested - current;
        const percent = Math.min(Math.round((current / suggested) * 100), 200);

        document.getElementById('visualSuggested').textContent = Math.round(suggested);
        document.getElementById('visualCurrent').textContent = current;
        const vRemain = document.getElementById('visualRemaining');
        vRemain.textContent = Math.round(remaining);
        vRemain.className = 'text-lg font-bold ' + (remaining >= 0 ? 'text-emerald-600' : 'text-red-600');
        document.getElementById('visualPercent').textContent = percent + '%';
        ['visualUnit', 'visualUnit2', 'visualUnit3'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = unit; });

        const progress = document.getElementById('visualProgress');
        progress.style.width = Math.min(percent, 100) + '%';
        progress.className = 'h-full rounded-full transition-all-300 ' + getProgressColor(percent);

        const advice = document.getElementById('visualAdvice');
        clearEl(advice);
        const meta = STATUS_META[profile.status || 'daily'];
        const lines = tab === 'calories'
            ? [meta.tip, `BMR: ${Math.round(stats.bmr)} kcal · 运动折算: ${Math.round(stats.totalExercise)} kcal`]
            : tab === 'protein'
                ? [`当前状态：${meta.label}`, `• 蛋白质建议：${suggestions.protein.min}~${suggestions.protein.max}g/日`]
                : [`当前状态：${meta.label}`, `• 碳水建议：${suggestions.carbs.min}~${suggestions.carbs.max}g/日`];
        lines.forEach(line => advice.appendChild(createEl('div', 'mb-2 text-xs text-gray-600', line)));

        drawPieChart(suggested, current, color);
    }

    function drawPieChart(suggested, current, color) {
        const canvas = document.getElementById('pieChart');
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const baseW = 280, baseH = 280;
        canvas.width = baseW * dpr; canvas.height = baseH * dpr;
        canvas.style.width = baseW + 'px'; canvas.style.height = baseH + 'px';
        ctx.scale(dpr, dpr);

        const cx = baseW / 2, cy = baseH / 2, radius = 110, innerR = 70;
        ctx.clearRect(0, 0, baseW, baseH);

        const ratio = Math.min(current / suggested, 2);
        const overRatio = ratio > 1 ? ratio - 1 : 0;
        const fillRatio = Math.min(ratio, 1);

        if (overRatio > 0) {
            ctx.beginPath(); ctx.arc(cx, cy, radius + 15, -Math.PI / 2, -Math.PI / 2 + overRatio * 2 * Math.PI);
            ctx.lineTo(cx, cy); ctx.fillStyle = '#EF4444'; ctx.fill();
        }
        ctx.beginPath(); ctx.arc(cx, cy, radius, 0, 2 * Math.PI); ctx.lineTo(cx, cy); ctx.fillStyle = '#E5E7EB'; ctx.fill();
        if (fillRatio > 0) {
            ctx.beginPath(); ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + fillRatio * 2 * Math.PI);
            ctx.lineTo(cx, cy); ctx.fillStyle = color; ctx.fill();
        }
        ctx.beginPath(); ctx.arc(cx, cy, innerR, 0, 2 * Math.PI); ctx.lineTo(cx, cy); ctx.fillStyle = '#FFF'; ctx.fill();

        const pct = Math.round((current / suggested) * 100);
        ctx.fillStyle = '#111827'; ctx.font = 'bold 32px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(pct + '%', cx, cy - 10);
        ctx.fillStyle = '#9CA3AF'; ctx.font = '12px Inter, sans-serif'; ctx.fillText('完成度', cx, cy + 15);
    }

    function renderCalendar() {
        const data = initData();
        if (!data || !data.profile) return;
        const year = state.calendarDate.getFullYear();
        const month = state.calendarDate.getMonth();
        document.getElementById('calendarMonth').textContent = `${year}年 ${month + 1}月`;

        const startPadding = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const grid = document.getElementById('calendarGrid');
        clearEl(grid);
        for (let i = 0; i < startPadding; i++) grid.appendChild(createEl('div', 'calendar-day'));

        const todayStr = getTodayStr();
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const dayData = data.history[dateStr];
            const color = getDayColor(data.profile, dayData);
            const cls = DAY_COLOR_CLASSES[color];
            const div = createEl('div', `calendar-day ${cls.bg} border ${cls.border} ${cls.text} cursor-pointer hover:opacity-80 transition-all-300`);
            if (dateStr === todayStr) div.classList.add('ring-2', 'ring-gray-900', 'ring-offset-1');
            div.appendChild(createEl('span', 'day-num', d));
            if (dayData) {
                const s = calcDayStats(data.profile, dayData);
                div.appendChild(createEl('span', 'day-val', Math.round(s.actualDeficit) + ''));
            }
            div.onclick = () => showDayDetail(dateStr);
            grid.appendChild(div);
        }
        document.getElementById('dayDetail').classList.add('hidden');
    }

    function changeMonth(delta) { state.calendarDate.setMonth(state.calendarDate.getMonth() + delta); renderCalendar(); }

    function closeDayDetail() { document.getElementById('dayDetail').classList.add('hidden'); state.selectedDate = null; }

    function showDayDetail(dateStr) {
        const data = initData();
        if (!data || !data.profile) return;
        state.selectedDate = dateStr;
        if (!data.history[dateStr]) {
            data.history[dateStr] = { exercises: [], meals: { breakfast: [], lunch: [], dinner: [] } };
            saveData(data);
        }
        const dayData = data.history[dateStr];
        const stats = calcDayStats(data.profile, dayData);
        const color = getDayColor(data.profile, dayData);

        const detail = document.getElementById('dayDetail');
        detail.classList.remove('hidden');
        document.getElementById('detailDate').textContent = new Date(dateStr + 'T00:00:00').toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });

        const badgeInfo = DETAIL_BADGE_INFO[color];
        const badge = document.getElementById('detailBadge');
        badge.textContent = badgeInfo.text;
        badge.className = badgeInfo.class;

        document.getElementById('detailAllow').textContent = `${Math.round(stats.allowance)} kcal`;
        document.getElementById('detailEaten').textContent = `${Math.round(stats.totalEaten)} kcal`;
        const remEl = document.getElementById('detailRemain');
        remEl.textContent = `${Math.round(stats.remaining)} kcal`;
        remEl.className = 'font-bold ' + (stats.remaining < 0 ? 'text-red-600' : 'text-emerald-600');

        const gapEl = document.getElementById('detailGap');
        if (stats.deficitGap <= -GREEN_THRESHOLD) { gapEl.textContent = `超额 ${Math.round(Math.abs(stats.deficitGap))} kcal`; gapEl.className = 'font-bold text-emerald-600'; }
        else if (stats.deficitGap <= 0) { gapEl.textContent = '已达标'; gapEl.className = 'font-bold text-amber-600'; }
        else { gapEl.textContent = `还差 ${Math.round(stats.deficitGap)} kcal`; gapEl.className = 'font-bold text-orange-600'; }

        const editSection = document.getElementById('historyEditSection');
        if (dateStr !== getTodayStr()) { editSection.classList.remove('hidden'); renderHistoryEditLists(); }
        else editSection.classList.add('hidden');

        const mealsDiv = document.getElementById('detailMeals');
        clearEl(mealsDiv);
        MEAL_TYPES.forEach(type => {
            const items = dayData.meals[type] || [];
            if (items.length === 0) return;
            const div = createEl('div', 'flex items-center justify-between py-2 border-b border-gray-50 last:border-0');
            const left = createEl('div');
            left.appendChild(createEl('span', 'font-medium text-gray-700', MEAL_LABELS[type]));
            left.appendChild(createEl('span', 'text-xs text-gray-400 ml-2', items.map(i => `${i.name} ${Math.round(calcFoodCal(i))}kcal`).join('、')));
            div.appendChild(left);
            div.appendChild(createEl('span', 'font-medium text-gray-900', `${Math.round(calcFoodSum(items))} kcal`));
            mealsDiv.appendChild(div);
        });
    }

    function renderHistoryEditLists() {
        if (!state.selectedDate) return;
        const data = initData();
        const dayData = data.history[state.selectedDate];
        if (!dayData) return;

        const exList = document.getElementById('historyExerciseList');
        clearEl(exList);
        dayData.exercises.forEach((ex, idx) => {
            const div = createEl('div', 'flex items-center justify-between bg-gray-50 rounded-lg px-2 py-1.5 text-xs');
            div.appendChild(createEl('span', 'text-gray-700', ex.name));
            const right = createEl('div', 'flex items-center gap-2');
            right.appendChild(createEl('span', 'font-medium text-gray-900', `${ex.calories} kcal`));
            const del = createEl('button', 'text-gray-400 hover:text-red-500', '✕');
            del.onclick = () => removeExercise(idx, true);
            right.appendChild(del);
            div.appendChild(right);
            exList.appendChild(div);
        });

        MEAL_TYPES.forEach(type => renderMealList(type, dayData.meals[type], true));
    }

    function renderSettings() {
        const data = initData();
        if (!data || !data.profile) return;
        const profile = data.profile;
        document.querySelectorAll('input[name="settingGender"]').forEach(r => { r.checked = r.value === profile.gender; });
        document.getElementById('settingHeight').value = profile.height;
        document.getElementById('settingWeight').value = profile.weight;
        document.getElementById('settingAge').value = profile.age;
        document.getElementById('settingStatus').value = profile.status || 'daily';

        const list = document.getElementById('quickFoodList');
        clearEl(list);
        const foods = data.quickFoods || [];
        if (foods.length === 0) {
            list.appendChild(createEl('div', 'text-sm text-gray-400 text-center py-4', '暂无常用食物，请添加'));
        } else {
            foods.forEach((f, idx) => {
                const div = createEl('div', 'flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2.5 text-sm');
                const left = createEl('div');
                left.appendChild(createEl('span', 'text-gray-700 font-medium', f.name));
                left.appendChild(createEl('span', 'text-xs text-gray-400 ml-2', `蛋白${f.protein || 0}g · 碳水${f.carb || 0}g · ${f.caloriesPer100g || 0}kcal/100g`));
                div.appendChild(left);
                const del = createEl('button', 'text-gray-400 hover:text-red-500 text-xs', '✕');
                del.onclick = () => removeQuickFood(idx);
                div.appendChild(del);
                list.appendChild(div);
            });
        }
    }

    function updateProfile() {
        const data = initData();
        if (!data) return;
        const gender = (document.querySelector('input[name="settingGender"]:checked') || {}).value || 'female';
        const height = Number(document.getElementById('settingHeight').value);
        const weight = Number(document.getElementById('settingWeight').value);
        const age = Number(document.getElementById('settingAge').value);
        const status = document.getElementById('settingStatus').value;
        if (!height || !weight || !age || height < 50 || height > 250 || weight < 20 || weight > 300 || age < 10 || age > 120) {
            showToast('请输入合理的身高、体重和年龄数值', 'warning'); return;
        }
        data.profile = { gender, height, weight, age, status };
        saveData(data);
        showToast('个人信息已更新', 'success');
        renderSettings(); renderHome(); renderVisual();
    }

    function addQuickFood() {
        const data = initData();
        const name = document.getElementById('quickFoodName').value.trim();
        const protein = Number(document.getElementById('quickFoodPro').value) || 0;
        const carb = Number(document.getElementById('quickFoodCarb').value) || 0;
        const caloriesPer100g = Number(document.getElementById('quickFoodCal').value) || 0;
        if (!name) { showToast('请输入食物名称', 'warning'); return; }
        const food = { name, protein, carb, caloriesPer100g };
        if (!validateQuickFood(food)) { showToast('食物数据格式不正确', 'warning'); return; }
        if (!data.quickFoods) data.quickFoods = [];
        data.quickFoods.push(food);
        saveData(data);
        ['quickFoodName', 'quickFoodPro', 'quickFoodCarb', 'quickFoodCal'].forEach(id => { document.getElementById(id).value = ''; });
        renderSettings(); renderQuickSelects();
    }

    function removeQuickFood(idx) {
        const data = initData();
        data.quickFoods.splice(idx, 1);
        saveData(data);
        renderSettings(); renderQuickSelects();
    }

    function clearToday() {
        showConfirm('确定清空今日所有打卡和运动记录吗？', () => {
            const data = initData();
            data.history[getTodayStr()] = { exercises: [], meals: { breakfast: [], lunch: [], dinner: [] } };
            saveData(data);
            const active = document.querySelector('.page.active').id;
            if (active === 'pageHome') renderHome();
            else if (active === 'pageSettings') renderSettings();
            else renderCalendar();
            showToast('当日数据已清空', 'info');
        });
    }

    function resetAll() {
        showConfirm('确定重置所有数据吗？基础信息、常用菜单和历史记录将全部清空。', () => {
            localStorage.removeItem(STORAGE_KEY);
            location.reload();
        });
    }

    function saveProfile() {
        const gender = (document.querySelector('input[name="gender"]:checked') || {}).value || 'female';
        const height = Number(document.getElementById('setupHeight').value);
        const weight = Number(document.getElementById('setupWeight').value);
        const age = Number(document.getElementById('setupAge').value);
        if (!height || !weight || !age || height < 50 || height > 250 || weight < 20 || weight > 300 || age < 10 || age > 120) {
            showToast('请输入合理的身高、体重和年龄数值', 'warning'); return;
        }
        let data = loadData();
        if (!data) data = createDefaultData({ gender, height, weight, age, status: 'daily' });
        else { data.profile = { gender, height, weight, age, status: data.profile.status || 'daily' }; ensureToday(data); }
        saveData(data);
        renderHome();
    }

    function downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
    }

    function exportQuickFoods() {
        const data = initData();
        const foods = data.quickFoods || [];
        if (foods.length === 0) { showToast('暂无常用饮食数据可导出', 'warning'); return; }
        let content = '========================================\n';
        content += '      热量计算器 - 常用饮食数据导出\n';
        content += '========================================\n';
        content += `导出时间: ${new Date().toLocaleString('zh-CN')}\n`;
        content += `数据数量: ${foods.length} 条\n`;
        content += '格式：食物名称|蛋白质(g/100g)|碳水(g/100g)|热量(kcal/100g)\n';
        content += '========================================\n';
        foods.forEach(f => { content += `${f.name}|${f.protein || 0}|${f.carb || 0}|${f.caloriesPer100g || 0}\n`; });
        downloadFile(content, `常用饮食数据_${getTodayStr()}.txt`, 'text/plain;charset=utf-8');
        showToast(`已成功导出 ${foods.length} 条常用饮食数据`, 'success');
    }

    function triggerQuickFoodImport() { document.getElementById('quickFoodImportInput').click(); }

    function importQuickFoodsFromText(content) {
        const imported = content.split('\n')
            .map(line => line.trim())
            .filter(line => line && !/^(=|---|导出|数据|格式|提示)/.test(line))
            .map(line => {
                const parts = line.split('|');
                if (parts.length < 2) return null;
                const food = { name: parts[0].trim(), protein: parseFloat(parts[1]) || 0, carb: parseFloat(parts[2]) || 0, caloriesPer100g: parseInt(parts[3]) || 0 };
                return validateQuickFood(food) ? food : null;
            })
            .filter(Boolean);
        if (imported.length === 0) { showToast('未找到有效的常用饮食数据', 'warning'); return; }
        const data = initData();
        if (!data.quickFoods) data.quickFoods = [];
        const existing = new Set(data.quickFoods.map(f => f.name));
        const newFoods = imported.filter(f => !existing.has(f.name));
        data.quickFoods = data.quickFoods.concat(newFoods);
        saveData(data);
        renderSettings(); renderQuickSelects();
        const skipped = imported.length - newFoods.length;
        showToast(`成功导入 ${newFoods.length} 条常用饮食数据${skipped > 0 ? `（跳过重复${skipped}条）` : ''}`, 'success');
    }

    function exportHistory() {
        const data = initData();
        const dates = Object.keys(data.history || {}).sort();
        if (dates.length === 0) { showToast('暂无历史打卡数据可导出', 'warning'); return; }
        let content = '========================================\n';
        content += '      热量计算器 - 历史打卡完整营养数据\n';
        content += '========================================\n';
        content += `导出时间: ${new Date().toLocaleString('zh-CN')}\n`;
        content += `数据天数: ${dates.length} 天\n`;
        content += '格式：早/午/晚 = 名称|蛋白|碳水|热量/100g|重量\n';
        content += '========================================\n';
        dates.forEach(date => {
            const d = data.history[date];
            content += `\n日期: ${date}\n`;
            d.exercises.forEach(ex => { content += `运动: ${ex.name}|${ex.calories}\n`; });
            MEAL_TYPES.forEach(type => (d.meals[type] || []).forEach(f => {
                content += `${MEAL_LABELS[type]}: ${f.name}|${f.protein || 0}|${f.carb || 0}|${f.caloriesPer100g || 0}|${f.weight || 0}\n`;
            }));
        });
        downloadFile(content, `历史完整营养_${getTodayStr()}.txt`, 'text/plain;charset=utf-8');
        showToast(`成功导出${dates.length}天完整营养数据`, 'success');
    }

    function triggerHistoryImport() { document.getElementById('historyImportInput').click(); }

    function importHistoryFromText(content) {
        const history = {};
        let currentDate = null, importedDays = 0, skippedDays = 0;
        content.split('\n').forEach(line => {
            line = line.trim();
            if (!line || /^(=|---|导出|数据|格式|提示)/.test(line)) return;
            if (line.startsWith('日期:')) {
                currentDate = line.replace('日期:', '').trim();
                if (!validateHistoryDate(currentDate)) { currentDate = null; return; }
                if (!history[currentDate]) history[currentDate] = { exercises: [], meals: { breakfast: [], lunch: [], dinner: [] } };
                return;
            }
            if (!currentDate) return;
            if (line.startsWith('运动:')) {
                const [name, calStr] = line.replace('运动:', '').split('|').map(s => s.trim());
                const cal = parseInt(calStr) || 0;
                const ex = { name, calories: cal };
                if (validateExercise(ex)) history[currentDate].exercises.push(ex);
                return;
            }
            MEAL_TYPES.forEach(type => {
                const label = MEAL_LABELS[type];
                if (line.startsWith(label + ':')) {
                    const parts = line.replace(label + ':', '').split('|').map(s => s.trim());
                    if (!parts[0]) return;
                    if (parts.length >= 5) {
                        const item = { name: parts[0], protein: parseFloat(parts[1]) || 0, carb: parseFloat(parts[2]) || 0, caloriesPer100g: parseFloat(parts[3]) || 0, weight: parseFloat(parts[4]) || 0 };
                        if (validateFoodItem(item)) history[currentDate].meals[type].push(item);
                    }
                }
            });
        });
        const data = initData();
        Object.keys(history).forEach(d => {
            if (data.history[d]) skippedDays++;
            else { data.history[d] = history[d]; importedDays++; }
        });
        saveData(data);
        renderCalendar(); renderHome(); renderVisual();
        showToast(`导入完成：新增${importedDays}天，跳过重复${skippedDays}天`, 'success');
    }

    function checkDayChange() {
        const today = getTodayStr();
        if (today !== state.lastCheckedDate) {
            const data = initData();
            if (data && !data.history[today]) {
                data.history[today] = { exercises: [], meals: { breakfast: [], lunch: [], dinner: [] } };
                saveData(data);
            }
            state.lastCheckedDate = today;
            showDayChangeToast();
            const active = document.querySelector('.page.active').id;
            if (active === 'pageHome') renderHome();
            else if (active === 'pageCalendar') renderCalendar();
            else if (active === 'pageSettings') renderSettings();
        }
    }

    function showDayChangeToast() {
        const toast = document.getElementById('dayChangeToast');
        const hour = new Date().getHours();
        let text = '🌅 新的一天已开启，昨日数据已自动归档';
        if (hour >= 12 && hour < 18) text = '☀️ 下午好，今日打卡继续';
        if (hour >= 18) text = '🌙 晚上好，记得完成今日打卡';
        if (hour >= 0 && hour < 6) text = '🌙 深夜了，注意休息';
        document.getElementById('dayChangeText').textContent = text;
        toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('hidden'), 4000);
    }

    function setupEventDelegation() {
        const ACTION_MAP = {
            'save-profile': () => saveProfile(),
            'update-profile': () => updateProfile(),
            'add-exercise': () => addExercise(false),
            'add-history-exercise': () => addExercise(true),
            'close-day-detail': () => closeDayDetail(),
            'add-quick-food': () => addQuickFood(),
            'export-quick-foods': () => exportQuickFoods(),
            'trigger-quick-food-import': () => triggerQuickFoodImport(),
            'export-history': () => exportHistory(),
            'trigger-history-import': () => triggerHistoryImport(),
            'clear-today': () => clearToday(),
            'reset-all': () => resetAll(),
            'change-month': (el) => changeMonth(parseInt(el.dataset.delta) || 0),
            'switch-page': (el) => switchPage(el.dataset.page),
            'switch-visual': (el) => switchVisualTab(el.dataset.tab),
            'download-selected-cloud-foods': () => downloadSelectedCloudFoods()
        };

        document.body.addEventListener('click', (e) => {
            const el = e.target.closest('[data-action]');
            if (!el) return;
            if (el.tagName !== 'INPUT' && el.type !== 'submit') e.preventDefault();
            const handler = ACTION_MAP[el.dataset.action];
            if (typeof handler === 'function') handler(el);
        });

        document.getElementById('quickFoodImportInput').addEventListener('change', function () {
            const file = this.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = ev => importQuickFoodsFromText(ev.target.result);
            reader.onerror = () => showToast('文件读取失败', 'error');
            reader.readAsText(file);
            this.value = '';
        });

        document.getElementById('historyImportInput').addEventListener('change', function () {
            const file = this.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = ev => importHistoryFromText(ev.target.result);
            reader.onerror = () => showToast('文件读取失败', 'error');
            reader.readAsText(file);
            this.value = '';
        });

        const cloudImportEl = document.getElementById('cloudFoodImportInput');
        if (cloudImportEl) {
            cloudImportEl.addEventListener('change', function () {
                const file = this.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = ev => importCloudFoodsFromJson(ev.target.result);
                reader.onerror = () => showToast('文件读取失败', 'error');
                reader.readAsText(file);
                this.value = '';
            });
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        const mealsContainer = document.getElementById('mealsContainer');
        MEAL_TYPES.forEach(t => mealsContainer.appendChild(buildMealSection(t, false)));

        const historyMealsContainer = document.getElementById('historyMealsContainer');
        if (historyMealsContainer) MEAL_TYPES.forEach(t => historyMealsContainer.appendChild(buildMealSection(t, true)));

        state.lastCheckedDate = getTodayStr();
        setupEventDelegation();
        renderHome();
        checkDayChange();
        setInterval(checkDayChange, 60000);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDayChange(); });
    });
})();
