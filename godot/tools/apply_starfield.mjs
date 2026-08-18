// 批量给场景加星空背景：Background ColorRect → TextureRect(渐变) + Starfield 节点
// 用法: node tools/apply_starfield.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const SCENES_DIR = "C:/Users/drtion/Desktop/myracler's files/亡命十三街/godot/scenes";
const scenes = [
  "classic/character_select.tscn",
  "classic/game_table.tscn",
  "football/football_select.tscn",
  "football/world_cup_shell.tscn",
  "football/league_shell.tscn",
  "solo/solo_shell.tscn",
  "simuniverse/uni_shell.tscn",
];

const SUB_RESOURCES = `[sub_resource type="Gradient" id="Gradient_bg"]
offsets = PackedFloat32Array(0, 0.25, 0.5, 0.75, 1)
colors = PackedColorArray(0.0196078, 0.0196078, 0.12549, 1, 0.0509804, 0.0627451, 0.207843, 1, 0.0705882, 0.0941176, 0.266667, 1, 0.0392157, 0.0588235, 0.180392, 1, 0.0235294, 0.0352941, 0.12549, 1)

[sub_resource type="GradientTexture2D" id="GradientTexture2D_bg"]
gradient = SubResource("Gradient_bg")
width = 1080
height = 1920
fill_from = Vector2(1, 0)
fill_to = Vector2(0, 1)
`;

const STARFIELD_NODE = `[node name="Starfield" type="Node2D" parent="."]
script = ExtResource("2_star")
`;

let ok = 0;
for (const rel of scenes) {
  const file = join(SCENES_DIR, rel);
  let txt = readFileSync(file, "utf8");

  if (txt.includes("Starfield")) {
    console.log("SKIP (already):", rel);
    ok++;
    continue;
  }

  // 1) 加 starfield ext_resource（紧跟第一个 ext_resource 后）
  const extMatch = txt.match(/^(\[ext_resource[^\n]*\n)/m);
  if (!extMatch) {
    console.log("FAIL (no ext_resource):", rel);
    continue;
  }
  const starExt = `[ext_resource type="Script" path="res://scripts/ui/starfield.gd" id="2_star"]\n`;
  txt = txt.replace(extMatch[0], extMatch[1] + starExt);

  // 2) 加 SubResource 块（第一个 [node 前）
  const nodeIdx = txt.indexOf("\n[node ");
  if (nodeIdx === -1) {
    console.log("FAIL (no node):", rel);
    continue;
  }
  txt = txt.slice(0, nodeIdx + 1) + "\n" + SUB_RESOURCES + txt.slice(nodeIdx + 1);

  // 3) Background: ColorRect → TextureRect，color 行 → texture 行
  const bgRe = /(\[node name="Background" type="ColorRect" parent="\."([^\]]*)\]\n)((?:[^\n]*\n)*?)(?=\[node )/;
  const bgMatch = txt.match(bgRe);
  if (!bgMatch) {
    console.log("FAIL (no Background):", rel);
    continue;
  }
  let block = bgMatch[0];
  block = block.replace(
    '[node name="Background" type="ColorRect" parent="."' + bgMatch[2],
    '[node name="Background" type="TextureRect" parent="."' + bgMatch[2]
  );
  block = block.replace(/color = Color\([^\n]*\)\n/, 'texture = SubResource("GradientTexture2D_bg")\n');
  // Background 块末尾插入 Starfield
  block = block.replace(/(\n)\s*$/, "$1\n" + STARFIELD_NODE);
  txt = txt.replace(bgRe, () => block);

  writeFileSync(file, txt);
  console.log("OK:", rel);
  ok++;
}
console.log(`\nDone: ${ok}/${scenes.length} processed`);
