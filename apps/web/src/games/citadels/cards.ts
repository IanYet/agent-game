export type Color='yellow'|'blue'|'green'|'red'|'purple';
export const COLORS:Record<Color,string>={yellow:'贵族',blue:'宗教',green:'商业',red:'军事',purple:'特殊'};
export const ROLES=[
  {rank:1,name:'刺客',symbol:'dagger',text:'指定另一身份，令其整回合无法行动；目标持有人暂不公开。'},
  {rank:2,name:'盗贼',symbol:'money-bag',text:'指定刺客与被刺杀身份以外的身份；叫到目标时，先拿走其全部金币。'},
  {rank:3,name:'魔术师',symbol:'wand',text:'与另一玩家交换全部手牌，或将任意手牌放回牌库底并抽等量牌。限一次。'},
  {rank:4,name:'国王',symbol:'crown',text:'获得王冠。可一次领取每座黄色建筑 1 金币的税收。'},
  {rank:5,name:'主教',symbol:'fleur-de-lis',text:'可一次领取每座蓝色建筑 1 金币；未被刺杀时整座城市免受军阀拆除。'},
  {rank:6,name:'商人',symbol:'parcel',text:'正常收入后额外获得 1 金币；可一次领取每座绿色建筑 1 金币。'},
  {rank:7,name:'建筑师',symbol:'set-square',text:'正常收入后额外抽两张建筑牌；本身份回合最多建造三座。'},
  {rank:8,name:'军阀',symbol:'helmet',text:'可一次领取每座红色建筑 1 金币；回合末可付建筑费用减一拆一座建筑。'},
] as const;
export interface DistrictDefinition {key:string;name:string;color:Color;cost:number;count:number;text?:string}
// FFG English reprint: 80 districts minus 14 starred Dark City cards = 66.
export const DISTRICTS:DistrictDefinition[]=[
  {key:'manor',name:'庄园',color:'yellow',cost:3,count:5},
  {key:'castle',name:'城堡',color:'yellow',cost:4,count:4},
  {key:'palace',name:'宫殿',color:'yellow',cost:5,count:3},
  {key:'temple',name:'神殿',color:'blue',cost:1,count:3},
  {key:'church',name:'教堂',color:'blue',cost:2,count:3},
  {key:'monastery',name:'修道院',color:'blue',cost:3,count:3},
  {key:'cathedral',name:'大教堂',color:'blue',cost:5,count:2},
  {key:'tavern',name:'酒馆',color:'green',cost:1,count:5},
  {key:'market',name:'市场',color:'green',cost:2,count:4},
  {key:'trading-post',name:'贸易站',color:'green',cost:2,count:3},
  {key:'docks',name:'码头',color:'green',cost:3,count:3},
  {key:'harbor',name:'海港',color:'green',cost:4,count:3},
  {key:'town-hall',name:'市政厅',color:'green',cost:5,count:2},
  {key:'watchtower',name:'瞭望塔',color:'red',cost:1,count:3},
  {key:'prison',name:'监狱',color:'red',cost:2,count:3},
  {key:'battlefield',name:'战场',color:'red',cost:3,count:3},
  {key:'fortress',name:'要塞',color:'red',cost:5,count:2},
  {key:'haunted-city',name:'鬼城',color:'purple',cost:2,count:1,text:'计分时可当一种自选颜色；最后一轮建造则仍为紫色。'},
  {key:'keep',name:'堡垒',color:'purple',cost:3,count:2,text:'军阀不能拆除这座建筑。'},
  {key:'laboratory',name:'实验室',color:'purple',cost:5,count:1,text:'每个身份回合一次：将一张手牌放回牌库底，获得 1 金币。'},
  {key:'smithy',name:'铁匠铺',color:'purple',cost:5,count:1,text:'每个身份回合一次：付 2 金币，抽三张牌全部保留。'},
  {key:'observatory',name:'天文台',color:'purple',cost:5,count:1,text:'正常抽牌收入改为抽三留一；与图书馆组合时抽三留二。'},
  {key:'graveyard',name:'墓地',color:'purple',cost:5,count:1,text:'军阀拆除建筑后，可付 1 金币收回该牌到手中。不能收回墓地自身，军阀本人不能使用。'},
  {key:'library',name:'图书馆',color:'purple',cost:6,count:1,text:'正常抽牌收入可保留两张。'},
  {key:'school-of-magic',name:'魔法学校',color:'purple',cost:6,count:1,text:'身份税收时视作对应颜色；五色计分时仍为紫色。'},
  {key:'university',name:'大学',color:'purple',cost:6,count:1,text:'建造和拆除按费用 6 计算；终局额外得 2 分。'},
  {key:'dragon-gate',name:'龙门',color:'purple',cost:6,count:1,text:'建造和拆除按费用 6 计算；终局额外得 2 分。'},
  {key:'great-wall',name:'长城',color:'purple',cost:6,count:1,text:'军阀拆除你其他建筑的费用增加 1；长城自身不加价。'},
];
export interface District {id:string;key:string}
export interface BuiltDistrict extends District {builtRound:number}
export const district=(card:District)=>DISTRICTS.find(d=>d.key===card.key)!;
export const cardName=(card:District)=>district(card).name;
export const roleName=(rank:number)=>ROLES[rank-1]?.name??'未公开身份';
export const makeDeck=():District[]=>DISTRICTS.flatMap(d=>Array.from({length:d.count},(_,i)=>({id:`${d.key}-${i+1}`,key:d.key})));
