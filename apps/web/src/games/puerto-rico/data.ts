export const GOODS=['corn','indigo','sugar','tobacco','coffee'] as const;
export type Good=typeof GOODS[number];
export type Goods=Record<Good,number>;
export const GOOD_NAMES:Record<Good,string>={corn:'玉米',indigo:'靛蓝',sugar:'蔗糖',tobacco:'烟草',coffee:'咖啡'};
export const PLANTATION_NAMES:Record<Good,string>={...GOOD_NAMES,sugar:'甘蔗'};
export const GOOD_COLORS:Record<Good,string>={corn:'#d8b85c',indigo:'#628fc5',sugar:'#d9d7c4',tobacco:'#ac7c55',coffee:'#725c54'};
export const GOOD_SUPPLY:Goods={corn:10,indigo:11,sugar:11,tobacco:9,coffee:9};
export const PLANTATION_COUNTS:Goods={corn:10,indigo:12,sugar:11,tobacco:9,coffee:8};
export const emptyGoods=():Goods=>({corn:0,indigo:0,sugar:0,tobacco:0,coffee:0});
export const ROLES=['settler','mayor','builder','craftsman','trader','captain','prospector_1','prospector_2'] as const;
export type Role=typeof ROLES[number];
export const ROLE_NAMES:Record<Role,string>={settler:'拓荒者',mayor:'市长',builder:'建筑师',craftsman:'工匠',trader:'商人',captain:'船长',prospector_1:'淘金者 Ⅰ',prospector_2:'淘金者 Ⅱ'};
export const ROLE_PRIVILEGES:Record<Role,string>={settler:'可改拿采石场',mayor:'额外一名人员',builder:'建造少付一金币',craftsman:'最后多领一桶',trader:'出售多得一金币',captain:'首次装船多得一分',prospector_1:'独自领取一金币',prospector_2:'独自领取一金币'};
export const BUILDING_KEYS=['small_indigo','small_sugar','small_market','hacienda','construction_hut','small_warehouse','indigo','sugar','hospice','office','large_market','large_warehouse','tobacco','coffee','factory','university','harbor','wharf','guild_hall','residence','fortress','customs_house','city_hall'] as const;
export type BuildingKey=typeof BUILDING_KEYS[number];
export interface BuildingDefinition {key:BuildingKey;name:string;english:string;cost:number;vp:number;workers:number;spaces:number;quantity:number;good?:Good;effect:string}
const b=(key:BuildingKey,name:string,english:string,cost:number,vp:number,workers:number,spaces:number,quantity:number,effect:string,good?:Good):BuildingDefinition=>({key,name,english,cost,vp,workers,spaces,quantity,effect,...(good?{good}:{})});
export const BUILDINGS:BuildingDefinition[]=[
  b('small_indigo','小染坊','Small indigo plant',1,1,1,1,4,'每名加工人员配合一块有人靛蓝种植园，生产一桶靛蓝。','indigo'),
  b('small_sugar','小糖厂','Small sugar mill',2,1,1,1,4,'每名加工人员配合一块有人甘蔗种植园，生产一桶蔗糖。','sugar'),
  b('small_market','小市场','Small market',1,1,1,1,2,'出售商品时额外获得一金币。'),
  b('hacienda','庄园','Hacienda',2,1,1,1,2,'拓荒时先额外抽取一块暗种植园，立即保留，再正常选地。'),
  b('construction_hut','建筑工棚','Construction hut',2,1,1,1,2,'拓荒时可改拿采石场；每阶段仍至多一块采石场。'),
  b('small_warehouse','小仓库','Small warehouse',3,1,1,1,2,'船运后可额外保留一种商品的任意桶数。'),
  b('indigo','大染坊','Indigo plant',3,2,3,1,3,'至多三名加工人员，各配合一块有人靛蓝种植园。','indigo'),
  b('sugar','大糖厂','Sugar mill',4,2,3,1,3,'至多三名加工人员，各配合一块有人甘蔗种植园。','sugar'),
  b('hospice','救济院','Hospice',4,2,1,1,2,'正常选取的种植园或采石场可立即带一名人员；庄园的额外地不享受此效果。'),
  b('office','商馆','Office',5,2,1,1,2,'可向贸易所出售已有种类，仍受四桶总容量限制。'),
  b('large_market','大市场','Large market',5,2,1,1,2,'出售商品时额外获得两金币，可与小市场叠加。'),
  b('large_warehouse','大仓库','Large warehouse',6,2,1,1,2,'船运后可额外保留两种商品；与小仓库合计三种。'),
  b('tobacco','烟草加工厂','Tobacco storage',5,3,3,1,3,'至多三名加工人员，各配合一块有人烟草种植园。','tobacco'),
  b('coffee','咖啡烘焙厂','Coffee roaster',6,3,2,1,3,'至多两名加工人员，各配合一块有人咖啡种植园。','coffee'),
  b('factory','工厂','Factory',7,3,1,1,2,'实际生产二、三、四、五种商品，分别获得一、二、三、五金币。'),
  b('university','大学','University',8,3,1,1,2,'新建建筑可立即放一名人员，多人员加工厂也只放一名。'),
  b('harbor','港口','Harbor',8,3,1,1,2,'每次装船额外一分，包括私人码头装运。'),
  b('wharf','私人码头','Wharf',9,3,1,1,2,'每个船长阶段至多一次，把某一种商品全部送回供应并计船运分；可以不用。'),
  b('guild_hall','行会大厅','Guild hall',10,4,1,2,1,'终局：每座小加工厂加一分，每座大加工厂加两分，无须加工厂有人。'),
  b('residence','官邸','Residence',10,4,1,2,1,'终局：岛屿已放地块不超过九／十／十一／十二块时，加四／五／六／七分。'),
  b('fortress','要塞','Fortress',10,4,1,2,1,'终局：每三名人员加一分，包括圣胡安的闲置人员。'),
  b('customs_house','海关','Customs house',10,4,1,2,1,'终局：每四枚船运胜利分加一分，建筑和终局奖励不计入。'),
  b('city_hall','市政厅','City hall',10,4,1,2,1,'终局：每座紫色建筑加一分，包括市政厅自身和无人建筑。'),
];
export const BUILDING_BY_KEY=Object.fromEntries(BUILDINGS.map(b=>[b.key,b])) as Record<BuildingKey,BuildingDefinition>;
export const RULES_URL='https://www.riograndegames.com/wp-content/uploads/2013/02/Puerto-Rico-Rules.pdf';
export const buildingRules=()=>BUILDINGS.map(b=>`${b.key}：${b.name}（${b.english}），${b.cost} 金币，${b.vp} 建筑分，占 ${b.spaces} 格，${b.workers} 人员位，供应 ${b.quantity} 块。${b.effect}`).join('\n');
