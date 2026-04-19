import { app } from "../../scripts/app.js";

console.log("### [PoseSelector] Extension script detected and loading...");

app.registerExtension({
    name: "Comfy.PoseSelector.Custom",
    async setup() {
        // Слушаем обновление от сервера
        const api = await import("../../scripts/api.js").then(m => m.api);
        api.addEventListener("pose_selector_update", (event) => {
            const data = event.detail;
            const nodeId = data.node_id;
            
            // Находим конкретную ноду по ID
            const node = app.graph.getNodeById(nodeId);
            if (node) {
                const catWidget = node.widgets.find(w => w.name === "category");
                const poseWidget = node.widgets.find(w => w.name === "pose_name");
                const templateWidget = node.widgets.find(w => w.name === "template");
                const hintWidget = node.widgets.find(w => w.name === "hint");

                // Обновляем текстовые данные немедленно
                if (catWidget) catWidget.value = data.category;
                if (templateWidget) templateWidget.value = data.prompt;
                if (hintWidget) hintWidget.value = data.hint;
                
                // Если категория изменилась, нужно обновить список доступных поз в выпадающем меню
                if (catWidget && catWidget.callback) {
                    catWidget.callback().then(() => {
                        if (poseWidget) poseWidget.value = data.pose_name;
                    });
                } else if (poseWidget) {
                    poseWidget.value = data.pose_name;
                }
                
                // Картинка загружается асинхронно
                if (data.image) {
                    const img = new Image();
                    img.src = `/pose_selector/view?filename=${data.image}&t=${new Date().getTime()}`;
                    img.onload = () => {
                        node.preview_img = img;
                        node.setDirtyCanvas(true, true);
                    };
                }
            }
        });
    },
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "PoseSelector") {
            // Обработка данных, возвращаемых через RETURN_TYPES + "ui"
            const onExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function (message) {
                if (onExecuted) onExecuted.apply(this, arguments);
                
                // Обновляем виджеты на основе того, что реально выбрал сервер
                const widgets = ["category", "pose_name", "template", "hint"];
                widgets.forEach(wName => {
                    const w = this.widgets.find(widget => widget.name === wName);
                    if (w && message[wName]) {
                        w.value = message[wName][0];
                    }
                });

                if (message.image && message.image[0]) {
                    const img = new Image();
                    img.src = `/pose_selector/view?filename=${message.image[0]}&t=${new Date().getTime()}`;
                    img.onload = () => {
                        this.preview_img = img;
                        this.setDirtyCanvas(true, true);
                    };
                }
            };

            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                
                console.log("### [PoseSelector] Node created, initializing widgets...");
                this.setSize([532, 950]); 

                const categoryWidget = this.widgets.find((w) => w.name === "category");
                const poseWidget = this.widgets.find((w) => w.name === "pose_name");
                const templateWidget = this.widgets.find((w) => w.name === "template");
                const hintWidget = this.widgets.find((w) => w.name === "hint");
                const randomCatWidget = this.widgets.find((w) => w.name === "random_from_category");
                const randomAllWidget = this.widgets.find((w) => w.name === "random_from_all");
                const seedWidget = this.widgets.find((w) => w.name === "seed");

                // Настройка Seed виджета (стандартное поведение ComfyUI)
                if (seedWidget) {
                    seedWidget.type = "number";
                    if (!seedWidget.linkedWidgets) {
                        // Добавляем кнопки управления сидом, если их нет
                        const controlWidget = this.addWidget("combo", "control_after_generate", "randomize", () => {}, {
                            values: ["fixed", "increment", "decrement", "randomize"],
                        });
                        // Сдвигаем его поближе к сиду, если нужно, но в ComfyUI обычно просто оставляют рядом
                    }
                }

                // Взаимное исключение чекбоксов
                if (randomCatWidget) {
                    randomCatWidget.callback = () => {
                        if (randomCatWidget.value && randomAllWidget) {
                            randomAllWidget.value = false;
                        }
                    };
                }
                if (randomAllWidget) {
                    randomAllWidget.callback = () => {
                        if (randomAllWidget.value && randomCatWidget) {
                            randomCatWidget.value = false;
                        }
                    };
                }

                // Стилизация
                if (templateWidget && templateWidget.inputEl) {
                    templateWidget.inputEl.readOnly = true;
                    templateWidget.inputEl.style.height = "70px";
                    templateWidget.inputEl.style.background = "rgba(0,0,0,0.1)";
                    templateWidget.computeSize = (width) => [width, 80];
                }
                if (hintWidget && hintWidget.inputEl) {
                    hintWidget.inputEl.readOnly = true;
                    hintWidget.inputEl.style.height = "120px"; 
                    hintWidget.inputEl.style.background = "rgba(0,0,0,0.2)";
                    hintWidget.computeSize = (width) => [width, 130];
                }

                // Кнопки Random добавляем ПЕРЕД превью
                this.addWidget("button", "🎲 Random (Category)", null, () => {
                    console.log("### [PoseSelector] Random Category clicked");
                    if (poseWidget && poseWidget.options.values) {
                        const values = poseWidget.options.values.filter(v => v !== "None");
                        if (values.length > 0) {
                            poseWidget.value = values[Math.floor(Math.random() * values.length)];
                            if (poseWidget.callback) poseWidget.callback();
                        }
                    }
                });

                this.addWidget("button", "🌐 Random (All)", null, async () => {
                    console.log("### [PoseSelector] Random All clicked");
                    if (categoryWidget && categoryWidget.options.values) {
                        const filteredCats = categoryWidget.options.values.filter(v => v !== "None");
                        if (filteredCats.length > 0) {
                            categoryWidget.value = filteredCats[Math.floor(Math.random() * filteredCats.length)];
                            if (categoryWidget.callback) {
                                await categoryWidget.callback();
                                const updatedPoseValues = poseWidget.options.values.filter(v => v !== "None");
                                if (updatedPoseValues.length > 0) {
                                    poseWidget.value = updatedPoseValues[Math.floor(Math.random() * updatedPoseValues.length)];
                                    if (poseWidget.callback) poseWidget.callback();
                                }
                            }
                        }
                    }
                });

                // Кастомный виджет превью
                const previewWidget = {
                    type: "pose_preview",
                    name: "pose_preview",
                    draw(ctx, node, widget_width, y, widget_height) {
                        const margin = 10;
                        const previewSize = widget_width - margin * 2;
                        ctx.fillStyle = "#111";
                        ctx.fillRect(margin, y, previewSize, previewSize);
                        ctx.strokeStyle = "#444";
                        ctx.strokeRect(margin, y, previewSize, previewSize);
                        if (node.preview_img && node.preview_img.complete) {
                            const img = node.preview_img;
                            const imgAspect = img.width / img.height;
                            let drawW = previewSize, drawH = previewSize;
                            if (imgAspect > 1) drawH = previewSize / imgAspect;
                            else drawW = previewSize * imgAspect;
                            ctx.drawImage(img, margin + (previewSize - drawW) / 2, y + (previewSize - drawH) / 2, drawW, drawH);
                        }
                    },
                    computeSize(width) { return [width, width - 20]; }
                };
                this.addCustomWidget(previewWidget);
                this.preview_img = null;

                // Функция обновления данных позы
                const updatePoseInfo = async () => {
                    const cat = categoryWidget.value;
                    const val = poseWidget.value;
                    if (!val || val === "None" || cat === "None") {
                        this.preview_img = null;
                        if (hintWidget) hintWidget.value = "";
                        if (templateWidget) templateWidget.value = "";
                        this.setDirtyCanvas(true);
                        return;
                    }
                    try {
                        const response = await fetch(`/extensions/comfyui-pose-selector/categories/${cat}.json?t=${new Date().getTime()}`);
                        const poses = await response.json();
                        const selected = poses.find(p => p.name === val);
                        if (selected) {
                            if (templateWidget) templateWidget.value = selected.prompt || "";
                            if (hintWidget) hintWidget.value = selected.hint || "";
                            if (selected.image) {
                                const img = new Image();
                                img.src = `/pose_selector/view?filename=${selected.image}&t=${new Date().getTime()}`;
                                img.onload = () => { this.preview_img = img; this.setDirtyCanvas(true, true); };
                            }
                        }
                    } catch (e) { console.error("### [PoseSelector] Update error:", e); }
                };

                // Функция обновления списка поз при смене категории
                const updatePoseList = async () => {
                    const cat = categoryWidget.value;
                    if (!cat || cat === "None") {
                        poseWidget.options.values = ["None"];
                        poseWidget.value = "None";
                        return;
                    }
                    try {
                        const response = await fetch(`/extensions/comfyui-pose-selector/categories/${cat}.json?t=${new Date().getTime()}`);
                        const poses = await response.json();
                        const names = poses.map(p => p.name);
                        poseWidget.options.values = names.length ? names : ["None"];
                        if (!names.includes(poseWidget.value)) {
                            poseWidget.value = names[0] || "None";
                        }
                        updatePoseInfo();
                    } catch (e) { console.error("### [PoseSelector] Category load error:", e); }
                };

                categoryWidget.callback = updatePoseList;
                poseWidget.callback = updatePoseInfo;

                // Начальная загрузка
                setTimeout(updatePoseList, 500);

                return r;
            };
        }
    }
});
