import os
import json
import re
from server import PromptServer
from aiohttp import web

class PoseSelector:
    def __init__(self):
        self.poses_data = []

    def _load_poses(self, category):
        if not category or category == "None":
            self.poses_data = []
            return
        
        json_path = os.path.join(os.path.dirname(__file__), "js", "categories", f"{category}.json")
        if os.path.exists(json_path):
            try:
                with open(json_path, 'r', encoding='utf-8-sig') as f:
                    self.poses_data = json.load(f)
            except Exception as e:
                print(f"### [PoseSelector] Error loading category {category}: {e}")
                self.poses_data = []
        else:
            self.poses_data = []

    @classmethod
    def INPUT_TYPES(s):
        categories_dir = os.path.join(os.path.dirname(__file__), "js", "categories")
        categories = ["None"]
        all_pose_names = ["None"]
        
        if os.path.exists(categories_dir):
            json_files = sorted([f for f in os.listdir(categories_dir) if f.endswith(".json")])
            categories = [f.replace(".json", "") for f in json_files]
            
            for json_file in json_files:
                try:
                    with open(os.path.join(categories_dir, json_file), 'r', encoding='utf-8-sig') as f:
                        data = json.load(f)
                        names = [pose["name"] for pose in data if "name" in pose]
                        all_pose_names.extend(names)
                except Exception as e:
                    print(f"### [PoseSelector] Error reading {json_file} for validation: {e}")

            if not categories:
                categories = ["None"]
        
        # Удаляем дубликаты и сортируем
        all_pose_names = sorted(list(set(all_pose_names)))

        return {
            "required": {
                "text": ("STRING", {"multiline": True, "default": "Photo of a person, {POSE}, high quality", "forceInput": True}),
                "category": (categories, ),
                "pose_name": (all_pose_names, ),
                "random_from_category": ("BOOLEAN", {"default": False}),
                "random_from_all": ("BOOLEAN", {"default": False}),
                "sequential_selection": ("BOOLEAN", {"default": False}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff}),
                "template": ("STRING", {"multiline": True, "default": ""}),
                "hint": ("STRING", {"multiline": True, "default": ""}),
            },
            "hidden": {"unique_id": "UNIQUE_ID"},
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING")
    RETURN_NAMES = ("text", "pose_name", "category")
    FUNCTION = "apply_pose"
    CATEGORY = "utils"

    @classmethod
    def IS_CHANGED(s, **kwargs):
        if kwargs.get("random_from_category") or kwargs.get("random_from_all") or kwargs.get("sequential_selection"):
            return kwargs.get("seed")
        return ""

    def apply_pose(self, text, category, pose_name, random_from_category=False, random_from_all=False, sequential_selection=False, seed=0, template="", hint="", unique_id=None):
        import random
        # Защита от None из старых workflow
        if seed is None:
            seed = 0
            
        rng = random.Random(seed)
        
        selected_prompt = ""
        selected_name = pose_name
        selected_category = category
        selected_image = ""
        selected_hint = ""
        
        if random_from_all:
            categories_dir = os.path.join(os.path.dirname(__file__), "js", "categories")
            if os.path.exists(categories_dir):
                # Исключаем категории, начинающиеся с "_"
                json_files = sorted([f for f in os.listdir(categories_dir) if f.endswith(".json") and not f.startswith("_")])
                if json_files:
                    if sequential_selection:
                        # Последовательный выбор по всем категориям
                        all_data = []
                        for jf in json_files:
                            try:
                                with open(os.path.join(categories_dir, jf), 'r', encoding='utf-8-sig') as f:
                                    cat_data = json.load(f)
                                    for item in cat_data:
                                        item["_category"] = jf.replace(".json", "")
                                    all_data.extend(cat_data)
                            except: continue
                        
                        if all_data:
                            idx = seed % len(all_data)
                            selected_pose = all_data[idx]
                            selected_category = selected_pose.get("_category", "")
                            selected_prompt = selected_pose.get("prompt", "")
                            selected_name = selected_pose.get("name", "")
                            selected_image = selected_pose.get("image", "")
                            selected_hint = selected_pose.get("hint", "")
                    else:
                        # Рандом по всем
                        random_json = rng.choice(json_files)
                        selected_category = random_json.replace(".json", "")
                        try:
                            with open(os.path.join(categories_dir, random_json), 'r', encoding='utf-8-sig') as f:
                                data = json.load(f)
                                if data:
                                    selected_pose = rng.choice(data)
                                    selected_prompt = selected_pose.get("prompt", "")
                                    selected_name = selected_pose.get("name", "")
                                    selected_image = selected_pose.get("image", "")
                                    selected_hint = selected_pose.get("hint", "")
                        except Exception as e:
                            print(f"### [PoseSelector] Error during random_from_all: {e}")
        
        elif random_from_category or sequential_selection:
            self._load_poses(category)
            if self.poses_data:
                if sequential_selection:
                    # Последовательный выбор внутри категории
                    idx = seed % len(self.poses_data)
                    selected_pose = self.poses_data[idx]
                else:
                    # Рандом внутри категории
                    selected_pose = rng.choice(self.poses_data)
                
                selected_prompt = selected_pose.get("prompt", "")
                selected_name = selected_pose.get("name", "")
                selected_image = selected_pose.get("image", "")
                selected_hint = selected_pose.get("hint", "")
        
        else:
            # Обычный режим (ручной выбор)
            self._load_poses(category)
            found = False
            for pose in self.poses_data:
                if pose.get("name") == pose_name:
                    selected_prompt = pose.get("prompt", "")
                    selected_image = pose.get("image", "")
                    selected_hint = pose.get("hint", "")
                    found = True
                    break
            
            # Если по какой-то причине не нашли (например, категория сменилась, а имя позы нет), берем первую
            if not found and self.poses_data:
                selected_pose = self.poses_data[0]
                selected_prompt = selected_pose.get("prompt", "")
                selected_name = selected_pose.get("name", "")
                selected_image = selected_pose.get("image", "")
                selected_hint = selected_pose.get("hint", "")
        
        # Отправляем сообщение на фронтенд для обновления UI именно этой ноды
        PromptServer.instance.send_sync("pose_selector_update", {
            "node_id": unique_id,
            "category": selected_category,
            "pose_name": selected_name,
            "prompt": selected_prompt,
            "hint": selected_hint,
            "image": selected_image
        })

        if not re.search(r"\{POSE\}", text, re.IGNORECASE):
            # Если тег не найден, просто возвращаем исходный текст
            pass

        result = re.sub(r"\{POSE\}", selected_prompt, text, flags=re.IGNORECASE)
        
        return {
            "ui": {
                "category": [selected_category],
                "pose_name": [selected_name],
                "template": [selected_prompt],
                "hint": [selected_hint],
                "image": [selected_image]
            },
            "result": (result, selected_name, selected_category)
        }


@PromptServer.instance.routes.get("/pose_selector/view")
async def view_pose(request):
    if "filename" in request.query:
        filename = request.query["filename"]
        if ".." in filename or filename.startswith("/") or filename.startswith("\\"):
            return web.Response(status=400)
        path = os.path.join(os.path.dirname(__file__), "poses", filename)
        if os.path.exists(path):
            return web.FileResponse(path)
    return web.Response(status=404)

NODE_CLASS_MAPPINGS = {"PoseSelector": PoseSelector}
NODE_DISPLAY_NAME_MAPPINGS = {"PoseSelector": "Pose Selector Node"}
