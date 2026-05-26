/**
 * 公开海龟汤题目种子脚本
 * 录入 10 道本格 + 10 道变格，共 20 道公开题目，state='active' 可直接游玩。
 *
 * 使用方式：
 *   cd apps/server
 *   npx tsx scripts/seed-puzzles.ts
 */

import 'reflect-metadata';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { initDatabase } from '../src/db/client';
import { soupPuzzles } from '../src/db/schema';
import { ulid } from 'ulid';
import { eq } from 'drizzle-orm';

// ── 题目数据 ────────────────────────────────────────────────────────────────

interface PuzzleInput {
  title: string;
  surface: string;
  truth: string;
  hints: string[];
  difficulty: number;
  tags: string[];
  expectedMinutes: number;
  keyPoints: Array<{
    id: string;
    description: string;
    keywords: string[];
    critical: boolean;
    weight: number;
  }>;
  sensitiveWords: string[];
}

const PUZZLES: PuzzleInput[] = [
  // ════════════════════════════════════════════════════════════
  // 本格（逻辑严密、现实可信的解法）
  // ════════════════════════════════════════════════════════════

  {
    title: '侏儒与电梯',
    surface:
      '一名住在30楼的男子，每天早上乘电梯下到1楼出门，傍晚回来时却只乘到15楼，然后步行走上去。但如果当天下雨，或者电梯里有其他乘客，他就会直接乘到30楼。这是为什么？',
    truth:
      '这名男子身材极为矮小，是个侏儒。他的身高不够，够不到电梯按钮面板上30楼的按键，只能勉强按到15楼。下雨天，他随身携带了雨伞，可以用伞尖戳到30楼的按钮；如果电梯里有其他乘客，他可以请对方帮忙按到30楼。',
    hints: [
      '他住在30楼，不是15楼，所以他是"想去"30楼的。',
      '思考他为什么"不能"按到30楼的按钮，而不是"不愿意"。',
      '为什么下雨天和有其他人时，情况会不同？',
    ],
    difficulty: 2,
    tags: ['本格', '日常', '经典'],
    expectedMinutes: 10,
    keyPoints: [
      { id: 'kp1', description: '男子身材矮小，是个侏儒', keywords: ['矮小', '侏儒', '矮子', '身高不够'], critical: true, weight: 1 },
      { id: 'kp2', description: '他够不到30楼的电梯按钮', keywords: ['够不到', '按钮', '按不到', '高度'], critical: true, weight: 1 },
      { id: 'kp3', description: '雨伞或他人帮忙解决了按钮问题', keywords: ['雨伞', '伞', '帮忙', '帮按'], critical: false, weight: 1 },
    ],
    sensitiveWords: ['侏儒', '矮子', '矮小', '身高', '按钮', '够不到'],
  },

  {
    title: '海龟汤',
    surface:
      '一名男子走进餐厅，点了一道名为"海龟汤"的菜。他喝了一口，放下汤匙，沉默片刻，随后结账离开，回到家后杀死了自己的妻子。',
    truth:
      '多年前，这名男子与妻子一同乘船出海，途中遭遇了严重的海难，在茫茫大海上漂流了数天，几近饿死。妻子端出一碗汤，说是用遇难时就地取材的海龟熬制的，让他喝下充饥。他喝了这碗汤，两人最终获救。今天，他第一次在餐厅喝到了真正的海龟汤，发现味道与当年截然不同。他这才恍然大悟：妻子当年端给他的，根本不是海龟汤——而是以同船遇难者的遗体熬成的人肉汤。这一发现彻底击垮了他，他无法接受妻子曾在他毫不知情的情况下让他食人，失控之下回家将其杀害。',
    hints: [
      '当年他并不是一个人在海上漂流的，除了妻子之外还有其他人。',
      '今天的汤味道和记忆中为什么不一样？',
      '如果当年漂流时根本无法捕到海龟，妻子的汤是用什么做的？',
    ],
    difficulty: 4,
    tags: ['本格', '海难', '悬疑', '经典'],
    expectedMinutes: 25,
    keyPoints: [
      { id: 'kp1', description: '男子与妻子曾在海上遭遇海难漂流', keywords: ['海难', '漂流', '船难', '大海', '遇难'], critical: true, weight: 1 },
      { id: 'kp2', description: '妻子当年给他喝的是人肉汤而非海龟汤', keywords: ['人肉', '遇难者', '食人', '遗体', '假的'], critical: true, weight: 1 },
      { id: 'kp3', description: '在餐厅喝到真正的海龟汤后他才发现了真相', keywords: ['味道不同', '真正的汤', '发现', '真相'], critical: false, weight: 1 },
    ],
    sensitiveWords: ['人肉', '遗体', '食人', '遇难者', '幸存者', '真相'],
  },

  {
    title: '灯塔守护者',
    surface: '一名男子打完一个电话后，立刻自杀了。',
    truth:
      '这名男子是一座灯塔的守护员，因休假已离开岗位数日。电话那头的朋友无意中提起，这几天海面上接连发生了严重的船难，多艘船只触礁沉没，死伤惨重。男子这才愕然意识到：他休假出发时，忘记点亮了灯塔的灯。正是他的这一疏忽，导致了这一系列惨烈的悲剧——船只在黑暗中找不到方向，撞上了礁石。面对这不可挽回的后果，他无法承受内心巨大的自责，选择结束了自己的生命。',
    hints: [
      '他从事的是一份与海上航行安全密切相关的工作。',
      '电话里的消息与他的工作失误有什么联系？',
      '如果灯塔的灯没有亮，会发生什么？',
    ],
    difficulty: 3,
    tags: ['本格', '悬疑', '自杀', '经典'],
    expectedMinutes: 15,
    keyPoints: [
      { id: 'kp1', description: '男子是灯塔的守护员', keywords: ['灯塔', '看守', '守护员', '看灯'], critical: true, weight: 1 },
      { id: 'kp2', description: '他休假前忘记点亮灯塔的灯', keywords: ['忘记', '没有点灯', '疏忽', '失职'], critical: true, weight: 1 },
      { id: 'kp3', description: '灯塔无灯导致船只触礁沉没', keywords: ['触礁', '船难', '沉船', '方向'], critical: false, weight: 1 },
    ],
    sensitiveWords: ['灯塔', '触礁', '船难', '看守', '失职', '疏忽'],
  },

  {
    title: '森林里的泳裤男',
    surface:
      '警方在一片深山老林中发现了一名男子的尸体，死者仅身穿一条泳裤，除此之外再无其他衣物。案发地点距最近的海洋、河流或游泳池有数百公里之遥。死者是如何出现在那里的？',
    truth:
      '这名男子正在一处室外游泳池内游泳，突然一架执行山林灭火任务的消防飞机低空飞过，该飞机使用特殊的取水装置，在飞掠水面时将大量池水——以及这名男子——一并吸入了机腹的储水舱中。飞机随后飞往数百公里外的山火现场，将储水舱中的水投下灭火。男子随之从高空坠落，摔死在了深山老林里。',
    hints: [
      '他当时应该处于一个相对安全的环境中，不是在野外或海上。',
      '他的死与某种飞行器有关。',
      '他是被某种力量"带"到那里去的，而不是自己走去的。',
    ],
    difficulty: 4,
    tags: ['本格', '意外', '奇异', '经典'],
    expectedMinutes: 20,
    keyPoints: [
      { id: 'kp1', description: '他在游泳时被消防飞机的取水装置吸入', keywords: ['消防飞机', '飞机', '取水', '吸入', '游泳池'], critical: true, weight: 1 },
      { id: 'kp2', description: '飞机飞往山火现场将他连同水一起投下', keywords: ['山火', '灭火', '投水', '抛下', '高空'], critical: true, weight: 1 },
      { id: 'kp3', description: '他死于高空坠落', keywords: ['坠落', '摔死', '高空', '坠亡'], critical: false, weight: 1 },
    ],
    sensitiveWords: ['消防飞机', '取水', '游泳池', '山火', '坠落', '投水'],
  },

  {
    title: '侦探的自杀',
    surface:
      '一名声望卓著的侦探历经数年追查，终于将一名臭名昭著的连环杀手绳之以法，嫌疑人被法庭正式宣判有罪。就在宣判结束的当天晚上，侦探在家中开枪自杀了。为什么？',
    truth:
      '这名侦探本人才是真正的连环杀手。他凭借自己作为侦探的专业知识，精心伪造了一切指向他人的证据，将所有罪行嫁祸给了一名完全无辜的人，并一手将这名无辜者推上了被告席。当无辜者被正式宣判有罪的那一刻，他清楚地意识到：一切已无从挽回，一个无辜的生命将因他的恶行蒙冤。他既无法公开自首，又无法忍受终其一生都要背负这份无法卸下的道德重压，最终选择以死亡结束一切。',
    hints: [
      '为什么一个成功破案的侦探会在最辉煌的时刻选择自杀？',
      '被定罪的"连环杀手"真的是凶手吗？',
      '侦探与这个案件的关系，比任何人想象得都要深。',
    ],
    difficulty: 4,
    tags: ['本格', '犯罪', '悬疑', '经典'],
    expectedMinutes: 20,
    keyPoints: [
      { id: 'kp1', description: '侦探本人就是真正的连环杀手', keywords: ['侦探是凶手', '真正的杀手', '侦探作案', '伪装'], critical: true, weight: 1 },
      { id: 'kp2', description: '他伪造证据嫁祸给了无辜者', keywords: ['嫁祸', '伪造证据', '无辜者', '陷害'], critical: true, weight: 1 },
      { id: 'kp3', description: '无辜者被定罪后他无法承受良心谴责', keywords: ['良心', '自责', '无辜被定罪', '无法承受'], critical: false, weight: 1 },
    ],
    sensitiveWords: ['凶手', '嫁祸', '无辜', '伪造证据', '良心', '连环杀手'],
  },

  {
    title: '密室冰柱',
    surface:
      '警探赶到案发现场，发现死者倒在一间彻底封闭的密室之中，胸口有一处贯穿性伤口，显然是被某种锋利的长型物体刺入致死。然而，整个密室被翻了个遍，没有发现任何凶器。现场仅有地板上的一滩水迹和少量碎玻璃。请问凶器是什么，它在哪里？',
    truth:
      '凶器是一根冰柱。凶手将冰柱刺入受害者体内致其死亡后，离开密室并将门窗封闭。冰柱在室温下逐渐融化，最终变成了地板上那滩水迹，凶器就此"消失"。碎玻璃是凶手原本用于存放和取用冰柱的玻璃容器，被敲碎后留下的残片。',
    hints: [
      '凶器并不是传统意义上"固体且永久存在"的武器。',
      '地板上的那滩水迹和碎玻璃，很可能不是无关的痕迹。',
      '凶器在完成使命后，改变了它的存在形态。',
    ],
    difficulty: 3,
    tags: ['本格', '密室', '凶器', '经典'],
    expectedMinutes: 15,
    keyPoints: [
      { id: 'kp1', description: '凶器是冰柱', keywords: ['冰柱', '冰块', '冰', '冰制武器'], critical: true, weight: 1 },
      { id: 'kp2', description: '冰柱融化后变成了地板上的水迹', keywords: ['融化', '水迹', '变成水', '消失'], critical: true, weight: 1 },
      { id: 'kp3', description: '碎玻璃是装冰柱的容器', keywords: ['玻璃容器', '碎玻璃', '存放冰', '容器'], critical: false, weight: 1 },
    ],
    sensitiveWords: ['冰柱', '冰块', '融化', '冰', '水迹'],
  },

  {
    title: '手枪止嗝',
    surface:
      '一名男子走进一间酒吧，向调酒师要了一杯水。调酒师没有去倒水，而是直接从柜台下掏出一把手枪，对准了他。男子愣了一下，随后道了声谢，转身离开了。这是怎么回事？',
    truth:
      '这名男子一直在打嗝，进酒吧是想喝水来帮助止嗝。机敏的调酒师一眼就看出了这一点，同时知道比起喝水，给人一个突如其来的惊吓往往是更有效的止嗝方法，于是掏出手枪制造了这个惊吓效果。男子的嗝果然停了下来，他明白了调酒师的好意，感谢了一声便转身离去。',
    hints: [
      '这名男子进酒吧不是为了喝酒。',
      '调酒师的行为并没有任何恶意，他只是在用一种特殊方式帮助这名男子。',
      '男子最终得到了他想要的效果，尽管方式与他预期的不同。',
    ],
    difficulty: 2,
    tags: ['本格', '日常', '惊吓', '经典'],
    expectedMinutes: 10,
    keyPoints: [
      { id: 'kp1', description: '男子在打嗝，进酒吧是为了要水止嗝', keywords: ['打嗝', '嗝', '止嗝', '喝水止嗝'], critical: true, weight: 1 },
      { id: 'kp2', description: '调酒师用惊吓的方式帮他止嗝', keywords: ['惊吓', '吓一跳', '止嗝方法', '惊'], critical: true, weight: 1 },
    ],
    sensitiveWords: ['打嗝', '嗝', '惊吓', '止嗝'],
  },

  {
    title: '雪地求生',
    surface:
      '两名探险家在极地暴风雪中迷失方向，食物彻底耗尽，被困了整整七天。七天后，其中一人拖着同伴的尸体，步履蹒跚地走到了救援站，随即被警方当场逮捕。为什么？',
    truth:
      '被困期间，这名探险家为了在极端环境下活下去，亲手杀死了同伴，以同伴的肉为食，才撑过了七天，最终独自抵达救援站。他对救援人员谎称同伴是因严寒与饥饿自然死亡的，他带着遗体是为了给同伴一个体面的交代。然而法医对尸体进行检验后，发现同伴并非死于自然原因，且尸体上有明显被人为切割的痕迹，他因此被当场逮捕。',
    hints: [
      '七天没有任何食物，在极寒环境中，人是很难存活的。',
      '他为什么要带着同伴的尸体来救援站？',
      '救援人员和法医发现了什么，让他立即被逮捕？',
    ],
    difficulty: 4,
    tags: ['本格', '极限生存', '探险'],
    expectedMinutes: 20,
    keyPoints: [
      { id: 'kp1', description: '他为了生存杀死了同伴', keywords: ['杀死同伴', '谋杀', '求生', '杀人'], critical: true, weight: 1 },
      { id: 'kp2', description: '他以同伴的肉为食维持了生命', keywords: ['食人', '人肉', '同伴的肉', '以同伴为食'], critical: true, weight: 1 },
      { id: 'kp3', description: '法医发现尸体有被切割的痕迹', keywords: ['法医', '切割', '痕迹', '鉴定'], critical: false, weight: 1 },
    ],
    sensitiveWords: ['食人', '人肉', '杀死', '同伴的肉', '切割'],
  },

  {
    title: '完美的不在场证明',
    surface:
      '一名男子在家中被毒杀，死亡时间是妻子出发去国外旅行后的第三天。妻子有多名证人可以作证，她在案发时身处千里之外的另一个国家，完全无法作案。然而警方仍然逮捕了她，并成功将其定罪。这是怎么回事？',
    truth:
      '妻子在出发之前，已经悄悄将一种发作极慢的慢性毒药混入了丈夫日常服用的药物或食物中。这种毒药在人体内需要数天时间才会积累到致死剂量并发作，恰好在她身处异国、不在场证明完全成立之后，才夺去了丈夫的生命。后来，毒物鉴定检测出了毒药的化学成分，警方顺藤摸瓜追查到了购买毒药的记录，最终证明了她的犯罪行为。',
    hints: [
      '案发时妻子的确不在场，这是铁的事实，警方也承认了这一点。',
      '丈夫的死亡时间和妻子下毒的时间，一定是同一时刻吗？',
      '致死的原因，是在案发那天发生的，还是在更早之前就已经埋下了？',
    ],
    difficulty: 3,
    tags: ['本格', '谋杀', '不在场证明'],
    expectedMinutes: 15,
    keyPoints: [
      { id: 'kp1', description: '妻子在离开前提前给丈夫下了慢性毒药', keywords: ['下毒', '提前', '慢性毒药', '出发前'], critical: true, weight: 1 },
      { id: 'kp2', description: '毒药发作时间与妻子不在场的时间吻合', keywords: ['缓慢发作', '延时', '慢慢发作', '数天后'], critical: true, weight: 1 },
      { id: 'kp3', description: '毒物鉴定最终揭露了真相', keywords: ['毒物鉴定', '检测', '化学成分', '购买记录'], critical: false, weight: 1 },
    ],
    sensitiveWords: ['毒药', '慢性毒药', '下毒', '毒物', '鉴定'],
  },

  {
    title: '异乡的报纸',
    surface:
      '一名男子只身旅行到一个语言完全不通的陌生国家，在酒店房间里翻开了当地的报纸，随即悲痛欲绝地号啕大哭。他不懂当地任何语言，也不认识当地任何人，他为什么会哭？',
    truth:
      '这名男子在出国前不久，与妻子发生了一场激烈的争吵，一气之下独自离开出行散心，期间两人断了联系。在陌生国家的酒店里，他漫无目的地翻开报纸，虽然完全看不懂文字，却在版面上一眼认出了一张照片——那是他妻子的照片。尽管文字对他毫无意义，但他能够从版面的气氛、排版布局，以及妻子照片出现在新闻版面上的事实，感知到了最坏的结果。他设法请人翻译，得知妻子在他出国后不久便遭遇意外不幸离世，而这竟成了他们的永别。',
    hints: [
      '他虽然看不懂文字，但报纸上还有什么他能看懂的东西？',
      '报纸上出现了他认识的某人的信息。',
      '他出国之前发生了什么？他们离开时的关系如何？',
    ],
    difficulty: 3,
    tags: ['本格', '异国', '亲情'],
    expectedMinutes: 15,
    keyPoints: [
      { id: 'kp1', description: '报纸上刊登了他妻子去世的消息和照片', keywords: ['妻子的照片', '妻子去世', '照片', '报纸上的人'], critical: true, weight: 1 },
      { id: 'kp2', description: '妻子在他出国后不久遭遇意外离世', keywords: ['意外去世', '妻子死亡', '离世', '出国后'], critical: true, weight: 1 },
      { id: 'kp3', description: '他们出国前刚刚吵架，这是永别', keywords: ['吵架', '争吵', '永别', '最后一次'], critical: false, weight: 1 },
    ],
    sensitiveWords: ['妻子', '去世', '照片', '遗憾', '离世', '死亡'],
  },

  // ════════════════════════════════════════════════════════════
  // 变格（答案出人意料，可含特殊视角或认知反转）
  // ════════════════════════════════════════════════════════════

  {
    title: '蒙眼女孩的秘密',
    surface:
      '一名男子将自己的眼角膜捐给了一名长年蒙着眼睛的女孩。女孩接受手术后成功恢复了视力，但在摘下眼罩、第一次看见这个世界后，当天便选择了自杀。为什么？',
    truth:
      '这名蒙着眼睛的女孩其实根本不是盲人——她蒙上眼睛是为了假装失明，以此博取路人的同情和施舍，靠欺骗为生。手术后，当她摘下眼罩第一次真正看见世界时，她也第一次清楚地看见了自己的所作所为：一个善良的好人为了帮助她，永久失去了一只眼睛，而她根本不需要这份帮助。这份沉重的愧疚和良心谴责彻底压垮了她，她无法承受这份罪孽，选择了以死作为对自己的惩罚。',
    hints: [
      '她恢复视力后应该是喜悦的，为什么反而选择了死亡？',
      '这名女孩蒙眼的真正原因是什么——她真的是盲人吗？',
      '当她看见这个世界的同时，她也看见了关于她自己的什么真相？',
    ],
    difficulty: 3,
    tags: ['变格', '牺牲', '反转'],
    expectedMinutes: 15,
    keyPoints: [
      { id: 'kp1', description: '女孩并不是真正的盲人，是假装失明的', keywords: ['假装', '欺骗', '不是盲人', '伪装', '诈骗'], critical: true, weight: 1 },
      { id: 'kp2', description: '她因良心谴责和愧疚无法承受而自杀', keywords: ['愧疚', '良心', '自责', '愧', '无法承受'], critical: true, weight: 1 },
      { id: 'kp3', description: '一个好人为她永久失去了一只眼睛', keywords: ['捐献', '眼睛', '单眼', '牺牲', '献出眼睛'], critical: false, weight: 1 },
    ],
    sensitiveWords: ['假装', '欺骗', '愧疚', '良心', '角膜', '捐献'],
  },

  {
    title: '山顶上的妻子',
    surface:
      '一对夫妻一同出发去登山，最终只有丈夫一人返回了山脚。警察问丈夫妻子的下落，丈夫回答："她在山顶上。"警察听完，立即将他逮捕了。为什么？',
    truth:
      '登山的正常流程是先爬到山顶，再原路返回山脚。如果妻子在登山途中迷失，下落不明，丈夫应该不清楚她具体在哪里。但丈夫明确说出妻子"在山顶上"，意味着他亲眼确认了妻子抵达山顶后就再也没有下来——这说明他在山顶上亲历了妻子的出事经过，却一个人下了山，既没有施救，也没有立即报警求助。警察据此判断，他有极大嫌疑是目睹妻子出事或亲手将其推落后独自逃走，于是将其逮捕以进一步调查。',
    hints: [
      '如果妻子只是在下山途中迷路了，丈夫能准确知道她在山顶上吗？',
      '他说妻子"在山顶上"这句话，暴露了什么不该知道的信息？',
      '从登山的逻辑来看，他一个人下山意味着什么？',
    ],
    difficulty: 3,
    tags: ['变格', '逻辑', '登山', '推理'],
    expectedMinutes: 15,
    keyPoints: [
      { id: 'kp1', description: '丈夫知道妻子在山顶，说明他在山顶目睹了出事经过', keywords: ['目睹', '山顶', '知道位置', '亲眼看见'], critical: true, weight: 1 },
      { id: 'kp2', description: '登山应先上山后下山，他只身返回暴露了异常', keywords: ['独自下山', '没有报警', '一个人回来', '没有施救'], critical: true, weight: 1 },
    ],
    sensitiveWords: ['山顶', '推落', '目睹', '谋杀', '逃走'],
  },

  {
    title: '地下室的窗户',
    surface:
      '一名男子推开一扇窗户，纵身跳了出去，摔在地面上，却毫发无伤，若无其事地走开了。这是怎么可能的？',
    truth:
      '这扇窗户位于地下室，窗口与外面的地面几乎等高。男子从地下室内部的角度看，窗户是在他的"上方"，但实际上窗户通向的是户外地面，跳出去只是从地下室爬到了户外地面，高度差仅有几十厘米，自然毫发无伤。',
    hints: [
      '他"跳出"窗户，一定是从高处跳下去吗？',
      '这扇窗户的位置有什么特殊之处？',
      '窗户通向的，是楼上，还是地面，还是……',
    ],
    difficulty: 2,
    tags: ['变格', '日常', '意外'],
    expectedMinutes: 8,
    keyPoints: [
      { id: 'kp1', description: '这是地下室的窗户，通向地面', keywords: ['地下室', '地下', '地面', '地下室窗户'], critical: true, weight: 1 },
      { id: 'kp2', description: '跳出窗户等于从地下爬到地面，高度差极小', keywords: ['高度', '几十厘米', '等高', '地平线'], critical: false, weight: 1 },
    ],
    sensitiveWords: ['地下室', '地下', '地面'],
  },

  {
    title: '失明的目击者',
    surface:
      '一名众所周知的盲人，独自"目睹"了一起谋杀案的全过程，他提供的证词准确详尽，最终帮助警方成功将凶手定罪。这是怎么可能的？',
    truth:
      '这名男子是一位视力正处于逐渐恢复阶段的病人，他曾经双目失明，但经过治疗，视力已经缓慢恢复到一定程度。案发的那一天，他的视力恰好恢复到了足以看清周围人物和事件的水平，因此真实目睹了整个谋杀过程，并如实向警方描述了他所看见的一切。由于周围所有人都认为他是盲人，从未想到他会成为目击证人，凶手也没有顾忌他的存在。',
    hints: [
      '他是"永久失明"，还是"暂时失明"，或者"正在恢复中"？',
      '他是如何描述他所"看到"的内容的，细节是否精确？',
      '为什么凶手没有在意他的存在？',
    ],
    difficulty: 3,
    tags: ['变格', '证人', '反转'],
    expectedMinutes: 12,
    keyPoints: [
      { id: 'kp1', description: '他的视力正处于恢复阶段，案发时已能看见', keywords: ['视力恢复', '能看见', '眼睛恢复', '不再失明', '复明'], critical: true, weight: 1 },
      { id: 'kp2', description: '所有人都以为他仍然是盲人，包括凶手', keywords: ['以为是盲人', '凶手没在意', '没人知道', '误以为'], critical: false, weight: 1 },
    ],
    sensitiveWords: ['视力', '复明', '恢复', '能看见', '失明'],
  },

  {
    title: '手术室里的奇迹',
    surface:
      '手术室里突然断电，手术无法继续进行，但躺在手术台上的"病人"完全没有受到任何影响。为什么？',
    truth:
      '手术台上躺着的并不是一名活着的病人，而是一具尸体。这是一堂供医学生练习外科技术的解剖课或尸体手术练习课，断电只是导致灯光熄灭，对手术台上的尸体来说自然没有任何影响，更不存在什么生命危险。',
    hints: [
      '这位"病人"不会因为手术中断而感到痛苦，也不会因等待而焦急。',
      '手术的目的，一定是为了救治某个活着的人吗？',
      '停电对躺在手术台上的人意味着什么——如果那不是一个活人？',
    ],
    difficulty: 2,
    tags: ['变格', '医学', '反转'],
    expectedMinutes: 8,
    keyPoints: [
      { id: 'kp1', description: '手术台上的是尸体而非活人', keywords: ['尸体', '遗体', '不是活人', '死尸', '尸'], critical: true, weight: 1 },
      { id: 'kp2', description: '这是解剖课或尸体外科练习课', keywords: ['解剖课', '练习课', '医学练习', '解剖', '尸体练习'], critical: false, weight: 1 },
    ],
    sensitiveWords: ['尸体', '解剖', '遗体', '死尸'],
  },

  {
    title: '停电后的凶案',
    surface:
      '一栋办公大楼突然全面停电，一名女子在一片漆黑中遇害。当电力在数小时后恢复，警察来到案发现场时，他们不需要询问任何人，便立刻锁定了凶手的位置。为什么？',
    truth:
      '凶手在黑暗中行凶后慌忙逃离，不小心踩进了血泊，随后在整栋大楼内留下了一串清晰可见的血脚印。当灯光重新亮起后，警察只需顺着这串血脚印一路追踪，便直接找到了凶手的藏身之处或逃跑路线的终点，无需向任何人问询便锁定了目标。',
    hints: [
      '黑暗中的行凶会不小心留下什么特殊的痕迹？',
      '为什么停电这件事反而"帮"了警察？',
      '电力恢复后，警察看见了什么？',
    ],
    difficulty: 2,
    tags: ['变格', '推理', '痕迹'],
    expectedMinutes: 10,
    keyPoints: [
      { id: 'kp1', description: '凶手踩进血泊留下了一串血脚印', keywords: ['血脚印', '脚印', '踩血', '血迹', '留下痕迹'], critical: true, weight: 1 },
      { id: 'kp2', description: '警察顺脚印找到了凶手', keywords: ['顺着脚印', '追踪', '找到凶手', '脚印追查'], critical: false, weight: 1 },
    ],
    sensitiveWords: ['血脚印', '脚印', '血迹', '凶手', '痕迹'],
  },

  {
    title: '两棵树之间的死者',
    surface:
      '一名男子被发现死在两棵大树之间的空地上，双手紧握着一根细长的木棍，周围没有其他任何人，也没有任何搏斗或外力的痕迹。他是怎么死的？',
    truth:
      '这名男子是一名走钢丝的杂技表演者。他在两棵树之间架设了一根细钢丝，正在上面练习走钢丝，手中握着的是用于保持平衡的平衡杆（看起来像一根木棍）。练习过程中，他失去了平衡，从钢丝上坠落，因坠地冲击而不治身亡。由于钢丝很细，在现场不易被一眼发现，所以第一眼看去显得颇为神秘。',
    hints: [
      '两棵树之间，除了这名男子本身，还有什么可能架设在那里？',
      '他手里的"木棍"有什么特殊用途？',
      '他的死因是坠落，但他从什么上面坠落的？',
    ],
    difficulty: 3,
    tags: ['变格', '意外', '谜案'],
    expectedMinutes: 12,
    keyPoints: [
      { id: 'kp1', description: '他是走钢丝的杂技演员，在树间的钢丝上练习', keywords: ['走钢丝', '钢丝', '杂技', '表演者', '杂技演员'], critical: true, weight: 1 },
      { id: 'kp2', description: '他从钢丝上失去平衡坠落而死', keywords: ['失去平衡', '坠落', '摔落', '跌落'], critical: true, weight: 1 },
      { id: 'kp3', description: '手中的木棍是平衡杆', keywords: ['平衡杆', '平衡棒', '保持平衡', '走钢丝道具'], critical: false, weight: 1 },
    ],
    sensitiveWords: ['走钢丝', '钢丝', '杂技', '平衡杆', '坠落'],
  },

  {
    title: '喝水的孩子',
    surface:
      '一名孩子在家人的注视下喝了满满一杯水，随即被紧急送进了医院。医生说孩子处于危及生命的险境。家人们感到极度困惑：水是普通的清水，里面什么都没有加。这是怎么回事？',
    truth:
      '在喝水之前，这名孩子刚刚经历了一次溺水事故，被人从水中救了出来。施救者在对孩子进行初步检查时，孩子处于半昏迷状态，下意识地咽下了体内残留的大量积水（以及肺部吸入的水分）。这引发了"二次溺水"，大量水分进入肺部，导致肺部积水，危及生命，必须立即送医处置。那杯"普通的清水"，加上体内本就残留的溺水积液，共同构成了危险。',
    hints: [
      '孩子喝水之前刚刚发生了什么事情？',
      '为什么普通的水，在这种情况下会变得致命？',
      '"二次溺水"是一种真实存在的医学现象，你听说过吗？',
    ],
    difficulty: 3,
    tags: ['变格', '医学', '意外'],
    expectedMinutes: 12,
    keyPoints: [
      { id: 'kp1', description: '孩子刚刚从溺水中被救起', keywords: ['溺水', '刚刚溺水', '从水中救出', '溺水获救'], critical: true, weight: 1 },
      { id: 'kp2', description: '二次溺水或肺部积水导致生命危险', keywords: ['二次溺水', '肺部积水', '肺水', '积水'], critical: true, weight: 1 },
    ],
    sensitiveWords: ['溺水', '二次溺水', '肺部积水', '肺水'],
  },

  {
    title: '双胞胎弟弟',
    surface:
      '一名男子坚称自己有一个双胞胎弟弟，但警方经过调查后表示找不到任何关于此人弟弟存在的证据。奇怪的是，这名男子的说法并没有被证伪，警察最终承认他说的是真话，不得不结束调查。为什么？',
    truth:
      '这名男子确实有一个双胞胎弟弟，但这个弟弟在出生时或出生后不久便不幸夭折了。因为夭折的时间太早，加之年代久远，相关的出生和死亡记录或许并不完整，警方初步调查没有找到明显证据。但这名男子说"我有一个双胞胎弟弟"在字面上是真实的——他曾经确实有过一个双胞胎弟弟，只是那个弟弟已经不在人世。警方在查阅更完整的档案后，证实了弟弟的出生记录，也由此确认了男子并没有说谎。',
    hints: [
      '他说"我有一个双胞胎弟弟"——在字面上，这句话是真的吗？',
      '警察找不到弟弟，是因为弟弟根本不存在，还是因为别的原因？',
      '这个"双胞胎弟弟"现在在哪里？',
    ],
    difficulty: 2,
    tags: ['变格', '推理', '逻辑'],
    expectedMinutes: 8,
    keyPoints: [
      { id: 'kp1', description: '双胞胎弟弟确实存在，但在出生时或幼年时便夭折了', keywords: ['夭折', '早逝', '幼年死亡', '出生时死', '不在了'], critical: true, weight: 1 },
      { id: 'kp2', description: '出生记录证明了双胞胎弟弟的存在', keywords: ['出生记录', '档案', '记录', '证明'], critical: false, weight: 1 },
    ],
    sensitiveWords: ['夭折', '早逝', '出生时', '双胞胎'],
  },

  {
    title: '飞机上的睡客',
    surface:
      '一具尸体出现在一架正在飞行的客机上，而整架飞机上没有任何乘客或机组人员注意到了这件事——包括坐在同一排的乘客。直到飞机平稳降落，工作人员在清舱时才发现。这怎么可能？',
    truth:
      '这名乘客在登机后不久便在座位上悄然去世，由于他的死亡过程极为安静（可能是突发心脏病或类似情况），没有任何动静和异常表现。他倚靠着椅背或窗户，闭着眼睛，外表看起来就像是一名正在熟睡的旅客。周围乘客以为他在睡觉，没有打扰；乘务员例行巡视时，同样以为他在安睡，不便叫醒。整个飞行过程中，无人察觉异样，直至降落后清舱时，工作人员发现无论如何都无法叫醒他，才意识到他已经离世。',
    hints: [
      '尸体一直处于显眼的公共座位上，为什么没有人发现？',
      '从外表来看，一具坐在飞机上的尸体，和什么最相像？',
      '乘务员为什么没有打扰他？',
    ],
    difficulty: 2,
    tags: ['变格', '意外', '日常', '飞机'],
    expectedMinutes: 8,
    keyPoints: [
      { id: 'kp1', description: '死者看起来像是在熟睡，无人发现异常', keywords: ['看起来在睡觉', '熟睡', '闭眼', '以为在睡', '外表无异常'], critical: true, weight: 1 },
      { id: 'kp2', description: '他在座位上悄然去世，没有任何动静', keywords: ['安静死去', '突发', '没有动静', '悄然', '无声无息'], critical: false, weight: 1 },
    ],
    sensitiveWords: ['尸体', '去世', '死亡', '心脏病'],
  },
];

// ── 插入逻辑 ────────────────────────────────────────────────────────────────

async function main() {
  const dbPath = process.env.DB_PATH ?? './data/dice-soup.db';
  console.log(`\n📦 连接数据库：${dbPath}`);

  const db = await initDatabase(dbPath);
  const now = Math.floor(Date.now() / 1000);

  let inserted = 0;
  let skipped = 0;

  for (const puzzle of PUZZLES) {
    // 按标题查重（避免重复录入）
    const existing = db
      .select({ id: soupPuzzles.id })
      .from(soupPuzzles)
      .where(eq(soupPuzzles.title, puzzle.title))
      .limit(1)
      .all();

    if (existing.length > 0) {
      // 更新已有记录的标签（修复历史泄露标签）
      db.update(soupPuzzles)
        .set({ tagsJson: JSON.stringify(puzzle.tags), updatedAt: now })
        .where(eq(soupPuzzles.title, puzzle.title))
        .run();
      console.log(`🔄 更新标签：《${puzzle.title}》→ ${puzzle.tags.join(' ')}`);
      skipped++;
      continue;
    }

    const id = ulid();
    db.insert(soupPuzzles)
      .values({
        id,
        title: puzzle.title,
        surface: puzzle.surface,
        truth: puzzle.truth,
        hintsJson: JSON.stringify(puzzle.hints),
        difficulty: puzzle.difficulty,
        tagsJson: JSON.stringify(puzzle.tags),
        expectedMinutes: puzzle.expectedMinutes,
        keyPointsJson: JSON.stringify(puzzle.keyPoints),
        sensitiveWordsJson: JSON.stringify(puzzle.sensitiveWords),
        metadataExtractedAt: now,
        metadataVersion: 1,
        source: 'public_domain',
        sourceUrl: null,
        state: 'active',
        createdBy: null,
        createdAt: now,
        updatedAt: now,
        playCount: 0,
      })
      .run();

    const tag = puzzle.tags.includes('本格') ? '本格' : '变格';
    const stars = '★'.repeat(puzzle.difficulty) + '☆'.repeat(5 - puzzle.difficulty);
    console.log(`✅ [${tag}] 《${puzzle.title}》${stars}`);
    inserted++;
  }

  console.log(`\n🎲 录入完成！新增 ${inserted} 道，跳过 ${skipped} 道`);
  console.log(`📊 题库共计 ${inserted + skipped} 道公开题目已可使用\n`);
}

main().catch((err) => {
  console.error('录入失败：', err);
  process.exit(1);
});
