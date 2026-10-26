# 公共镭射卡组件

`apps/web/src/visuals/HolographicCard.tsx` 提供暗色镭射卡面、指针光照、鼠标倾角和圆角饰圈。璀璨宝石的发展牌、贵族卡与暗抽牌背，富饶之城的身份与建筑卡共用它。游戏通过 `children` 提供数字、图标、费用和说明，公共组件不读取游戏数据。

## 使用

游戏目录中的 React 组件可直接导入，样式随组件载入：

```tsx
import {HolographicCard} from '../../visuals/HolographicCard';

<HolographicCard
  as="button"
  glowColor="#81c9ff"
  highlightColor="#81c9ff"
  selected={selected}
  aria-pressed={selected}
  aria-label="查看建筑卡，4 点声望"
  onClick={onSelect}
>
  <header>4</header>
  <div style={{marginTop:'auto'}}>游戏自己的费用图标</div>
</HolographicCard>
```

卡面默认宽 112px，宽高比为 64∶91，内容沿纵向排列，内边距 12px。`children` 位于内层 `.holographic-card-face` 中、材质层上方，可以通过自己的类名调整布局。尺寸可以传入 CSS 长度或变量，例如 `width="var(--card-width,112px)"`；内容的字号与间距由调用方决定。小于 112px 的卡片会同步缩小光斑、炫光带和图案受光范围，最小保留默认范围的 40%；较大卡片保留原有光照范围。需要调整卡面内边距或阴影时，样式作用于 `.holographic-card-face`。

正方形金色王冠卡：

```tsx
<HolographicCard
  aspectRatio={1}
  pattern="crowns"
  glowColor="#dfb86a"
  highlightColor="#9d7b45"
  trimColor="#9d7b4566"
  role="img"
  aria-label="贵族，3 点声望"
>
  {/* 游戏自己的声望与要求 */}
</HolographicCard>
```

## 属性

| 属性 | 默认值 | 用途 |
| --- | --- | --- |
| `as` | `"div"` | 根元素，可选 `"div"`、`"button"`；按钮默认 `type="button"` |
| `glowColor` | `"#c3cbd6"` | 光晕与单色刻线的颜色，使用六位十六进制色值 `#RRGGBB` |
| `highlightColor` | 与 `glowColor` 相同 | 悬停、键盘聚焦及选中时的外框颜色，支持 CSS 颜色 |
| `trimColor` | `"#737d8c66"` | 悬停或键盘聚焦时显示的内圈颜色 |
| `rainbow` | `false` | 开启彩虹衍射与珠光刻线；关闭时使用 `glowColor` |
| `pattern` | `"contours"` | `"contours"` 为等高线，`"crowns"` 为错行王冠，`"rings"` 为同心圆，`"symbols"` 为错行平铺的符号；也可传入自定义刻纹对象，各纹路单独使用 |
| `patternSymbol` | `"sparkle"` | `pattern="symbols"` 时平铺的 SVG 图标名称，例如 `"crown"`；可用图标见 `visuals/svg-icons.ts` |
| `width` | `112` | 卡片宽度，数字以 CSS px 为单位，也可传入 CSS 长度或变量 |
| `aspectRatio` | `64 / 91` | 宽高比，例如 `1` 为正方形 |
| `radius` | `12` | 外圆角半径，单位为 CSS px，最小为 2 |
| `restingLight` | `[0.09, 0.09]` | 静止光点的相对位置 `[x,y]`，取值限制在 0–1；`[0,0]` 为左上角 |
| `tilt` | `true` | 鼠标移动时整张卡面平滑倾斜，离开后回正；传入 `false` 关闭倾角，保留光照跟随 |
| `selected` | `false` | 外框持续使用高亮色，不增加黄色选中轮廓 |
| `children` | — | 调用方提供的卡面内容 |

根元素的原生属性、事件和 `ref` 会透传，类型随 `as` 变化。外层根元素提供稳定的布局、点击与指针感应区域，内层卡面统一倾斜，材质、数字、图标和饰圈一起运动。`selected` 只控制视觉，按钮的 `aria-pressed`、图片的 `role` 与 `aria-label` 由调用方提供。`className` 和 `style` 可调整根元素的布局和尺寸。按钮内不要嵌套其他交互控件。

外框固定 2px，内圈固定 1px、向内收进 7px，内圆角为外圆角的 0.875 倍。材质按外圆角减去边框宽度裁切，透镜使用相同轮廓。默认光点在左上角；指针进入后平滑移向指针，离开后返回静止位置。键盘聚焦会把光点移向中心；选中状态只保留外框颜色，内圈仍在悬停或聚焦时显示。

静止卡面保持正面朝向，默认光点位置不产生常驻倾斜。鼠标越靠近卡面边缘，倾斜越明显，单轴最大 10°，投影角点的位移遵循公共的 20 CSS px 上限。键盘聚焦与触屏输入不驱动倾角；减少动态或静态画面偏好下保持正面朝向。

所有镭射卡统一使用默认的平行炫光，光色由 `glowColor` 和 `rainbow` 决定。富饶之城的身份卡传入 `pattern="symbols"` 和 `patternSymbol={身份的 SVG 图标名称}`，选中或当前叫号身份的 `restingLight` 为 `[0.5,0.5]`，其余为 `[0.09,0.09]`。建筑卡使用 `pattern="rings"` 与类别色，选中时同样将静止光点放在中央。`GoldCoin.tsx` 提供两款游戏共用的金币图标；`engraved` 开启时保留暗色凹刻层，由公共绘制器控制受光后的金色图层。

游戏自己的纹路可通过 `pattern={{key,paint}}` 提供，类型为组件导出的 `HolographicEngraving`。`key` 是纹路的唯一缓存名，`paint(ctx,width,height)` 在已经按像素密度缩放的 Canvas 上绘制白色刻线，尺寸单位是 CSS px，透明度控制刻线强度。对象应定义在组件外，纹路或绘制参数改变时更换缓存名。公共绘制器将这些刻线送入同一镭射材质，不叠加等高线；Canvas 降级也沿用相同纹路和彩虹配色。

璀璨宝石的暗抽牌背由游戏目录的 `reserve-artwork.ts` 绘制五种宝石轮廓，使用固定排列与随机朝向，中央留出金币区域。金币外轮廓是常显的无填充 SVG，币边、内圈与币面细纹直接画进同一镭射纹路层，受光时显现，没有金色填充。金币与周围宝石刻线之间保留间距。预留来源由游戏在卡片下方统一标注，不进入倾斜卡面。

## 图标随光照显色

需要保留凹刻底色、受光后才出现彩色切面的 SVG，使用以下结构：

```tsx
<svg
  viewBox="0 0 100 100"
  width="18"
  height="18"
  data-holographic-ink
  data-lens-svg
  role="img"
  aria-label="红宝石"
>
  <g fill="#30222d">
    <path d="M24 14H76L94 39L50 94L6 39Z" />
  </g>
  <g data-holographic-color>
    <path d="M24 14H76L94 39L50 94L6 39Z" fill="#b51e45" />
    {/* 其余彩色切面也放在这一层 */}
  </g>
</svg>
```

`data-holographic-ink` 标记受光的图标。公共绘制器按图标中心与当前光点计算显色程度，通过 `--holographic-ink-light` 输出 0–1 的数值；公共样式用它控制内部 `data-holographic-color` 图层的透明度。凹刻层始终保留，由调用方绘制自己的颜色与渐变。普通常彩图标省略 `data-holographic-ink` 即可。

`data-lens-svg` 让鼠标透镜读取 SVG 的当前图层、线性渐变、变换和透明度，卡片以外的 SVG 也可使用。支持 `path`、`polygon`、`polyline`、`circle`、`ellipse`、`rect`、`line` 和 `g`；渐变 ID 应保持唯一。彩色切面放在 SVG 的直接子 `g` 中，可在整体半透明时保持重叠切面的颜色。外部图片、SVG 滤镜与蒙版不在此绘制路径内。

## 绘制与维护

所有实例共享一个 WebGL2 上下文，再将各卡当前画面写入自己的 Canvas。透镜先在卡片自己的平面绘制材质、文字、图标与圆角饰圈，再应用与页面相同的透视投影；背包里的卡片也会叠加外层面板的投影。光照或倾角更新后会发送统一的视觉帧通知，让透镜重新取样；此组件的透镜识别使用通用属性与类名。只有光点、倾角变化或内容、尺寸更新时才重绘；离屏、页面隐藏和被 `inert` 遮挡时暂停。减少动态或静态画面偏好下保持静止光点，WebGL2 不可用时使用 Canvas 绘制。卸载最后一张卡时释放共享纹理、绘制器与监听。

入口为 `HolographicCard.tsx`，材质绘制器为 `HolographicMaterial.tsx`，纹路为 `holographic-engraving.ts` 与 `holographic.glsl.ts`，SVG 透镜绘制为 `lens-svg.ts`。倾角复用 `card-tilt.ts`，页面与透镜共用 `card-projection.ts` 的投影计算。这些文件都位于 `apps/web/src/visuals/`，不依赖具体游戏。

材质改编自 [vgpu Holographic Card](https://vgpu.sh/examples/holographic-card)。MIT 许可与版权声明保留在公共着色器和 `apps/web/public/licenses/vgpu.txt` 中。
