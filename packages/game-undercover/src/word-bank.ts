/**
 * @module game-undercover/word-bank
 * 种子词库（内置 100+ 对，source='seed'）。
 * 正式上线前可替换或删除测试词对。
 */

import type { WordPair } from './types';

interface SeedWordPair {
  normalWord: string;
  undercoverWord: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

export const SEED_WORD_PAIRS: SeedWordPair[] = [
  // 食物类
  { normalWord: '苹果',   undercoverWord: '梨',      category: '食物', difficulty: 'easy' },
  { normalWord: '西瓜',   undercoverWord: '哈密瓜',  category: '食物', difficulty: 'easy' },
  { normalWord: '香蕉',   undercoverWord: '芭蕉',    category: '食物', difficulty: 'medium' },
  { normalWord: '草莓',   undercoverWord: '樱桃',    category: '食物', difficulty: 'medium' },
  { normalWord: '番茄',   undercoverWord: '柿子',    category: '食物', difficulty: 'hard' },
  { normalWord: '橙子',   undercoverWord: '橘子',    category: '食物', difficulty: 'hard' },
  { normalWord: '咖啡',   undercoverWord: '茶',      category: '食物', difficulty: 'easy' },
  { normalWord: '可乐',   undercoverWord: '雪碧',    category: '食物', difficulty: 'easy' },
  { normalWord: '饺子',   undercoverWord: '汤圆',    category: '食物', difficulty: 'medium' },
  { normalWord: '粽子',   undercoverWord: '汤圆',    category: '食物', difficulty: 'medium' },
  { normalWord: '寿司',   undercoverWord: '刺身',    category: '食物', difficulty: 'medium' },
  { normalWord: '汉堡',   undercoverWord: '三明治',  category: '食物', difficulty: 'easy' },
  { normalWord: '包子',   undercoverWord: '馒头',    category: '食物', difficulty: 'easy' },
  { normalWord: '面条',   undercoverWord: '米粉',    category: '食物', difficulty: 'easy' },
  { normalWord: '火锅',   undercoverWord: '麻辣烫',  category: '食物', difficulty: 'easy' },
  { normalWord: '披萨',   undercoverWord: '烤饼',    category: '食物', difficulty: 'medium' },
  { normalWord: '冰激凌', undercoverWord: '雪糕',    category: '食物', difficulty: 'easy' },
  { normalWord: '巧克力', undercoverWord: '糖果',    category: '食物', difficulty: 'easy' },
  { normalWord: '薯片',   undercoverWord: '饼干',    category: '食物', difficulty: 'easy' },
  { normalWord: '饼干',   undercoverWord: '蛋糕',    category: '食物', difficulty: 'easy' },

  // 动物类
  { normalWord: '猫',     undercoverWord: '狗',      category: '动物', difficulty: 'easy' },
  { normalWord: '狮子',   undercoverWord: '老虎',    category: '动物', difficulty: 'easy' },
  { normalWord: '大象',   undercoverWord: '河马',    category: '动物', difficulty: 'easy' },
  { normalWord: '蝴蝶',   undercoverWord: '蜻蜓',    category: '动物', difficulty: 'medium' },
  { normalWord: '鹦鹉',   undercoverWord: '八哥',    category: '动物', difficulty: 'hard' },
  { normalWord: '企鹅',   undercoverWord: '北极熊',  category: '动物', difficulty: 'medium' },
  { normalWord: '长颈鹿', undercoverWord: '斑马',    category: '动物', difficulty: 'medium' },
  { normalWord: '海豚',   undercoverWord: '鲨鱼',    category: '动物', difficulty: 'easy' },
  { normalWord: '蚊子',   undercoverWord: '苍蝇',    category: '动物', difficulty: 'easy' },
  { normalWord: '蜜蜂',   undercoverWord: '黄蜂',    category: '动物', difficulty: 'hard' },

  // 地点类
  { normalWord: '超市',   undercoverWord: '菜市场',  category: '地点', difficulty: 'easy' },
  { normalWord: '图书馆', undercoverWord: '书店',    category: '地点', difficulty: 'easy' },
  { normalWord: '医院',   undercoverWord: '诊所',    category: '地点', difficulty: 'medium' },
  { normalWord: '电影院', undercoverWord: '剧场',    category: '地点', difficulty: 'easy' },
  { normalWord: '游泳池', undercoverWord: '浴室',    category: '地点', difficulty: 'medium' },
  { normalWord: '机场',   undercoverWord: '火车站',  category: '地点', difficulty: 'easy' },
  { normalWord: '公园',   undercoverWord: '广场',    category: '地点', difficulty: 'easy' },
  { normalWord: '学校',   undercoverWord: '培训班',  category: '地点', difficulty: 'easy' },
  { normalWord: '银行',   undercoverWord: '当铺',    category: '地点', difficulty: 'medium' },
  { normalWord: '酒店',   undercoverWord: '民宿',    category: '地点', difficulty: 'easy' },

  // 职业类
  { normalWord: '医生',   undercoverWord: '护士',    category: '职业', difficulty: 'easy' },
  { normalWord: '老师',   undercoverWord: '教练',    category: '职业', difficulty: 'easy' },
  { normalWord: '厨师',   undercoverWord: '烘焙师',  category: '职业', difficulty: 'medium' },
  { normalWord: '演员',   undercoverWord: '歌手',    category: '职业', difficulty: 'easy' },
  { normalWord: '警察',   undercoverWord: '保安',    category: '职业', difficulty: 'easy' },
  { normalWord: '消防员', undercoverWord: '救生员',  category: '职业', difficulty: 'medium' },
  { normalWord: '程序员', undercoverWord: '设计师',  category: '职业', difficulty: 'medium' },
  { normalWord: '司机',   undercoverWord: '飞行员',  category: '职业', difficulty: 'easy' },
  { normalWord: '画家',   undercoverWord: '摄影师',  category: '职业', difficulty: 'medium' },
  { normalWord: '律师',   undercoverWord: '法官',    category: '职业', difficulty: 'hard' },

  // 运动类
  { normalWord: '足球',   undercoverWord: '篮球',    category: '运动', difficulty: 'easy' },
  { normalWord: '乒乓球', undercoverWord: '羽毛球',  category: '运动', difficulty: 'easy' },
  { normalWord: '网球',   undercoverWord: '壁球',    category: '运动', difficulty: 'hard' },
  { normalWord: '游泳',   undercoverWord: '跳水',    category: '运动', difficulty: 'medium' },
  { normalWord: '跑步',   undercoverWord: '竞走',    category: '运动', difficulty: 'medium' },
  { normalWord: '骑自行车', undercoverWord: '骑摩托', category: '运动', difficulty: 'easy' },
  { normalWord: '滑冰',   undercoverWord: '滑雪',    category: '运动', difficulty: 'easy' },
  { normalWord: '健身',   undercoverWord: '瑜伽',    category: '运动', difficulty: 'easy' },
  { normalWord: '武术',   undercoverWord: '跆拳道',  category: '运动', difficulty: 'medium' },
  { normalWord: '棒球',   undercoverWord: '垒球',    category: '运动', difficulty: 'hard' },

  // 日用品类
  { normalWord: '手机',   undercoverWord: '平板',    category: '日用品', difficulty: 'easy' },
  { normalWord: '电脑',   undercoverWord: '笔记本',  category: '日用品', difficulty: 'easy' },
  { normalWord: '牙刷',   undercoverWord: '牙签',    category: '日用品', difficulty: 'medium' },
  { normalWord: '镜子',   undercoverWord: '窗户',    category: '日用品', difficulty: 'medium' },
  { normalWord: '钥匙',   undercoverWord: '密码锁',  category: '日用品', difficulty: 'medium' },
  { normalWord: '雨伞',   undercoverWord: '遮阳伞',  category: '日用品', difficulty: 'hard' },
  { normalWord: '台灯',   undercoverWord: '手电筒',  category: '日用品', difficulty: 'medium' },
  { normalWord: '被子',   undercoverWord: '毯子',    category: '日用品', difficulty: 'easy' },
  { normalWord: '书包',   undercoverWord: '行李箱',  category: '日用品', difficulty: 'easy' },
  { normalWord: '眼镜',   undercoverWord: '墨镜',    category: '日用品', difficulty: 'easy' },

  // 自然现象
  { normalWord: '下雨',   undercoverWord: '下雪',    category: '自然', difficulty: 'easy' },
  { normalWord: '打雷',   undercoverWord: '闪电',    category: '自然', difficulty: 'medium' },
  { normalWord: '彩虹',   undercoverWord: '极光',    category: '自然', difficulty: 'medium' },
  { normalWord: '海浪',   undercoverWord: '潮汐',    category: '自然', difficulty: 'hard' },
  { normalWord: '地震',   undercoverWord: '火山爆发', category: '自然', difficulty: 'medium' },
  { normalWord: '沙漠',   undercoverWord: '戈壁',    category: '自然', difficulty: 'hard' },
  { normalWord: '森林',   undercoverWord: '丛林',    category: '自然', difficulty: 'medium' },
  { normalWord: '河流',   undercoverWord: '溪流',    category: '自然', difficulty: 'hard' },
  { normalWord: '山峰',   undercoverWord: '丘陵',    category: '自然', difficulty: 'hard' },
  { normalWord: '湖泊',   undercoverWord: '水库',    category: '自然', difficulty: 'medium' },

  // 娱乐/文化类
  { normalWord: '电影',   undercoverWord: '电视剧',  category: '娱乐', difficulty: 'easy' },
  { normalWord: '漫画',   undercoverWord: '小说',    category: '娱乐', difficulty: 'easy' },
  { normalWord: '音乐会', undercoverWord: '演唱会',  category: '娱乐', difficulty: 'medium' },
  { normalWord: '迪斯科', undercoverWord: '蹦迪',    category: '娱乐', difficulty: 'easy' },
  { normalWord: '麻将',   undercoverWord: '扑克',    category: '娱乐', difficulty: 'easy' },
  { normalWord: '象棋',   undercoverWord: '围棋',    category: '娱乐', difficulty: 'medium' },
  { normalWord: '钢琴',   undercoverWord: '吉他',    category: '娱乐', difficulty: 'easy' },
  { normalWord: '舞蹈',   undercoverWord: '体操',    category: '娱乐', difficulty: 'easy' },
  { normalWord: '旅游',   undercoverWord: '度假',    category: '娱乐', difficulty: 'easy' },
  { normalWord: '露营',   undercoverWord: '野餐',    category: '娱乐', difficulty: 'medium' },

  // 交通工具
  { normalWord: '公共汽车', undercoverWord: '地铁',  category: '交通', difficulty: 'easy' },
  { normalWord: '自行车', undercoverWord: '电动车',  category: '交通', difficulty: 'easy' },
  { normalWord: '轮船',   undercoverWord: '游艇',    category: '交通', difficulty: 'medium' },
  { normalWord: '直升机', undercoverWord: '热气球',  category: '交通', difficulty: 'medium' },
  { normalWord: '出租车', undercoverWord: '网约车',  category: '交通', difficulty: 'hard' },
  { normalWord: '高铁',   undercoverWord: '动车',    category: '交通', difficulty: 'hard' },
  { normalWord: '摩托车', undercoverWord: '三轮车',  category: '交通', difficulty: 'easy' },
  { normalWord: '飞机',   undercoverWord: '滑翔机',  category: '交通', difficulty: 'medium' },
  { normalWord: '帆船',   undercoverWord: '独木舟',  category: '交通', difficulty: 'medium' },
  { normalWord: '卡车',   undercoverWord: '面包车',  category: '交通', difficulty: 'easy' },

  // 工具类
  { normalWord: '剪刀',   undercoverWord: '刀',      category: '工具', difficulty: 'easy' },
  { normalWord: '锤子',   undercoverWord: '斧头',    category: '工具', difficulty: 'easy' },
  { normalWord: '扫帚',   undercoverWord: '拖把',    category: '工具', difficulty: 'easy' },
  { normalWord: '针',     undercoverWord: '别针',    category: '工具', difficulty: 'hard' },
  { normalWord: '尺子',   undercoverWord: '圆规',    category: '工具', difficulty: 'easy' },
];

export function getSeedWordPairs(): Array<SeedWordPair & { id: string }> {
  return SEED_WORD_PAIRS.map((pair, i) => ({
    ...pair,
    id: `seed_${String(i + 1).padStart(3, '0')}`,
  }));
}

/** 从词对列表随机选取一个，排除已用过的 */
export function selectRandomWordPair(
  available: WordPair[],
  excludeIds: string[] = [],
): WordPair | null {
  const candidates = available.filter((p) => !excludeIds.includes(p.id));
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}
