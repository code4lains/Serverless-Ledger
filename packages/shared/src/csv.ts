/**
 * 账盾 - CSV 与 JSON 数据导入导出及智能账单解析引擎
 * 遵循《项目技术白皮书》3.5、6.3、7.3 规范
 */

import { Transaction, Category, Ledger, TransactionType, LoanType } from './models.js';
import { toCents, toYuan, formatMoney } from './money.js';
import { getCategoryMeta, getDefaultCategories } from './categories.js';

export type BillFormatType = 'standard' | 'wechat' | 'alipay' | 'generic';

export interface CsvExportOptions {
  ledgerId?: string; // 'all' 或具体 ledger_id
  format?: 'csv' | 'json';
  dateRange?: 'all' | 'year' | 'month' | 'custom';
  startDate?: string;
  endDate?: string;
  type?: TransactionType | 'all';
}

export interface ParsedBillItem {
  id?: string;
  transaction_date: string; // ISO 字符串
  type: TransactionType;
  amount: number; // 单位：分，必须 >= 1
  category_id?: string | null;
  category_name?: string; // 解析得到的分类名称或匹配到的分类名
  matched_category_id?: string | null;
  from_account?: string | null;
  to_account?: string | null;
  remark?: string | null;
  ledger_id?: string;
  raw_data?: Record<string, string>;
  is_valid: boolean;
  error_message?: string;
}

export interface BillParseResult {
  format_type: BillFormatType;
  format_name: string;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  total_expense: number; // 分
  total_income: number; // 分
  total_transfer: number; // 分
  total_loan: number; // 分
  items: ParsedBillItem[];
  warnings: string[];
}

/**
 * 1. RFC 4180 规范的高性能 CSV 文本解析器
 * 支持：
 * - 字段内包含逗号、换行符（\r\n 或 \n）
 * - 双引号转义（""）
 * - UTF-8 BOM 自动剥离
 */
export function parseCsvString(csvText: string): string[][] {
  if (!csvText || typeof csvText !== 'string') {
    return [];
  }

  // 剥离 UTF-8 BOM 头 (\uFEFF)
  let text = csvText;
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  while (i < len) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        // 检查是否为双引号转义 ""
        if (i + 1 < len && text[i + 1] === '"') {
          currentField += '"';
          i += 2;
          continue;
        } else {
          // 引号结束
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (char === ',') {
        currentRow.push(currentField.trim());
        currentField = '';
        i++;
        continue;
      } else if (char === '\r') {
        // 兼容 \r\n 或单独 \r
        if (i + 1 < len && text[i + 1] === '\n') {
          i++;
        }
        currentRow.push(currentField.trim());
        if (currentRow.some((f) => f.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
        i++;
        continue;
      } else if (char === '\n') {
        currentRow.push(currentField.trim());
        if (currentRow.some((f) => f.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    }
  }

  // 处理最后一行与最后一个字段
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((f) => f.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * 2. 生成规范的 CSV 文本
 * 自动处理转义，并添加 UTF-8 BOM 确保 Windows/Excel 打开不乱码
 */
export function generateCsvString(rows: (string | number | null | undefined)[][]): string {
  const lines = rows.map((row) =>
    row
      .map((cell) => {
        if (cell === null || cell === undefined) return '';
        const str = String(cell);
        // 如果包含逗号、换行或双引号，则使用双引号包裹并转义
        if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      })
      .join(',')
  );

  // 加上 UTF-8 BOM 前缀
  return '\uFEFF' + lines.join('\r\n');
}

/**
 * 3. 智能关键词分类匹配规则库
 */
interface CategoryKeywordRule {
  categoryId: string;
  type: TransactionType;
  keywords: string[];
}

const DEFAULT_KEYWORD_RULES: CategoryKeywordRule[] = [
  // 餐饮美食
  { categoryId: 'cat_exp_food_bf', type: 'expense', keywords: ['早餐', '早点', '包子', '油条', '豆浆', '肯德基早餐', '麦当劳早餐'] },
  { categoryId: 'cat_exp_food_lunch', type: 'expense', keywords: ['午餐', '午饭', '便当', '快餐'] },
  { categoryId: 'cat_exp_food_dinner', type: 'expense', keywords: ['晚餐', '晚饭', '聚餐', '火锅', '烧烤', '烤肉', '料理', '饭店', '酒楼', '西餐厅'] },
  { categoryId: 'cat_exp_food_snack', type: 'expense', keywords: ['奶茶', '咖啡', '星巴克', '瑞幸', '喜茶', '奈雪', '饮料', '茶百道', '蜜雪冰城', 'coco', '零食', '水果', '百果园', '鲜果', '良品铺子', '三只松鼠', '面包', '蛋糕', '烘焙'] },
  { categoryId: 'cat_exp_food_grocery', type: 'expense', keywords: ['买菜', '菜市场', '叮咚买菜', '朴朴超市', '盒马生鲜', '食材'] },
  { categoryId: 'cat_exp_food_fruit', type: 'expense', keywords: ['水果', '果切', '生鲜'] },
  { categoryId: 'cat_exp_food_takeout', type: 'expense', keywords: ['美团外卖', '饿了么', '外卖', '外带'] },
  { categoryId: 'cat_exp_food', type: 'expense', keywords: ['美团', '餐饮', '食堂', '美食', '小吃', '面馆', '米线', '汉堡', '肯德基', '麦当劳', '必胜客'] },

  // 交通出行
  { categoryId: 'cat_exp_tr_metro', type: 'expense', keywords: ['地铁', '轨道交通', '乘车码', '申通地铁', '京港地铁', '羊城通', '公交', '巴士', '公交车', '公交卡'] },
  { categoryId: 'cat_exp_tr_taxi', type: 'expense', keywords: ['滴滴', '花小猪', '高德打车', '出租车', '打车', '网约车', '曹操出行', 'T3出行'] },
  { categoryId: 'cat_exp_tr_gas', type: 'expense', keywords: ['加油', '中国石化', '中国石油', '壳牌', '加气', '充电桩', '特来电', '星星充电'] },
  { categoryId: 'cat_exp_tr_parking', type: 'expense', keywords: ['停车', '停车场', '停车费', '泊车', 'ETC', '高速通行费'] },
  { categoryId: 'cat_exp_tr_bike', type: 'expense', keywords: ['哈啰单车', '美团单车', '青桔单车', '单车', '电车'] },
  { categoryId: 'cat_exp_tr_flight', type: 'expense', keywords: ['机票', '航空', '中国国航', '南方航空', '东方航空', '春秋航空', '航旅纵横', '高铁', '火车', '12306', '铁路', '动车'] },
  { categoryId: 'cat_exp_traffic', type: 'expense', keywords: ['出行', '交通', '过路费', '租车', '神州租车'] },

  // 购物消费
  { categoryId: 'cat_exp_sh_daily', type: 'expense', keywords: ['超市', '沃尔玛', '山姆', '家乐福', '盒马', '大润发', '永辉', '便利店', '7-Eleven', '全家', '罗森', '日用', '杂货'] },
  { categoryId: 'cat_exp_sh_cloth', type: 'expense', keywords: ['服装', '衣服', '优衣库', 'ZARA', '鞋', '耐克', '阿迪达斯', '李宁', '安踏', '服饰'] },
  { categoryId: 'cat_exp_sh_digital', type: 'expense', keywords: ['数码', '手机', '电脑', '苹果', 'Apple', '华为', '小米', 'OPPO', 'vivo', '索尼', 'Switch', 'Steam', 'PlayStation', '家电'] },
  { categoryId: 'cat_exp_sh_beauty', type: 'expense', keywords: ['美妆', '护肤', '化妆品', '口红', '丝芙兰'] },
  { categoryId: 'cat_exp_sh_express', type: 'expense', keywords: ['快递', '顺丰', '中通', '圆通', '申通', '韵达', '菜鸟', '邮费'] },
  { categoryId: 'cat_exp_shopping', type: 'expense', keywords: ['淘宝', '天猫', '京东', '拼多多', '唯品会', '抖音电商', '快手电商', '得物', '购物', '商场', '百货', '专柜'] },

  // 居住生活
  { categoryId: 'cat_exp_ho_rent', type: 'expense', keywords: ['房租', '租金', '自如', '相寓', '房东', '物业', '物业费', '车位费'] },
  { categoryId: 'cat_exp_ho_util', type: 'expense', keywords: ['电费', '水费', '燃气费', '暖气费', '国家电网', '南方电网', '水务'] },
  { categoryId: 'cat_exp_ho_telecom', type: 'expense', keywords: ['话费', '宽带', '中国移动', '中国联通', '中国电信', '充值中心', '手机充值'] },
  { categoryId: 'cat_exp_ho_furn', type: 'expense', keywords: ['家居', '家装', '宜家', '家具', '软装'] },
  { categoryId: 'cat_exp_ho_repair', type: 'expense', keywords: ['保洁', '家政', '维修', '修理', '修锁'] },
  { categoryId: 'cat_exp_housing', type: 'expense', keywords: ['居住', '生活', '家庭开销'] },

  // 休闲娱乐
  { categoryId: 'cat_exp_ent_game', type: 'expense', keywords: ['游戏', '充值', '腾讯充值', '网易游戏', '米哈游', '原神', '王者荣耀', '和平精英', 'Steam Purchase', 'PlayStation'] },
  { categoryId: 'cat_exp_ent_sport', type: 'expense', keywords: ['健身', '游泳', '运动', '羽毛球', '篮球', '足球', '滑雪'] },
  { categoryId: 'cat_exp_ent_travel', type: 'expense', keywords: ['旅游', '门票', '景点', '携程', '去哪儿', '同程', '飞猪', '酒店', '民宿', '如家', '汉庭', '希尔顿'] },
  { categoryId: 'cat_exp_ent_movie', type: 'expense', keywords: ['电影', '影院', '淘票票', '猫眼', '万达影城', '影城', '剧场', '演唱会', '话剧'] },
  { categoryId: 'cat_exp_ent_party', type: 'expense', keywords: ['KTV', '剧本杀', '密室', '洗浴', '按摩', '足疗', '酒吧', '网咖', '聚会'] },
  { categoryId: 'cat_exp_entertain', type: 'expense', keywords: ['娱乐', '休闲'] },

  // 医疗保健
  { categoryId: 'cat_exp_med_drug', type: 'expense', keywords: ['药店', '大药房', '海王星辰', '同仁堂', '叮当快药', '买药', '药品'] },
  { categoryId: 'cat_exp_med_treat', type: 'expense', keywords: ['医院', '门诊', '急诊', '挂号', '牙科', '口腔', '诊所'] },
  { categoryId: 'cat_exp_med_check', type: 'expense', keywords: ['体检', '保健', '疫苗', '爱康国宾', '美年大健康'] },
  { categoryId: 'cat_exp_medical', type: 'expense', keywords: ['医疗', '健康', '看病'] },

  // 学习进修
  { categoryId: 'cat_exp_edu_book', type: 'expense', keywords: ['书店', '书籍', '图书', '当当', '教材', '新华书店'] },
  { categoryId: 'cat_exp_edu_course', type: 'expense', keywords: ['培训', '课程', '考证', '学费', '网课'] },
  { categoryId: 'cat_exp_edu_office', type: 'expense', keywords: ['文具', '办公用品', '打印', '复印', '得力', '晨光'] },
  { categoryId: 'cat_exp_education', type: 'expense', keywords: ['学习', '进修', '教育'] },

  // 人情社交
  { categoryId: 'cat_exp_soc_red', type: 'expense', keywords: ['发红包', '礼金', '压岁钱', '份子钱', '给红包'] },
  { categoryId: 'cat_exp_soc_gift', type: 'expense', keywords: ['请客', '送礼', '礼物', '伴手礼'] },
  { categoryId: 'cat_exp_soc_elder', type: 'expense', keywords: ['孝敬', '长辈', '赡养'] },
  { categoryId: 'cat_exp_social', type: 'expense', keywords: ['社交', '人情'] },

  // 其他支出
  { categoryId: 'cat_exp_oth_loss', type: 'expense', keywords: ['丢失', '损失', '被盗', '罚款'] },
  { categoryId: 'cat_exp_oth_misc', type: 'expense', keywords: ['杂项', '其它', '其他消费'] },
  { categoryId: 'cat_exp_other', type: 'expense', keywords: ['其他支出', '未知支出'] },

  // 收入分类
  { categoryId: 'cat_inc_sal_base', type: 'income', keywords: ['工资', '薪水', '月薪', '发薪', '薪资', '代发工资', '基本工资'] },
  { categoryId: 'cat_inc_sal_bonus', type: 'income', keywords: ['奖金', '补贴', '绩效', '津贴'] },
  { categoryId: 'cat_inc_sal_part', type: 'income', keywords: ['兼职', '副业', '劳务报酬', '稿费', '课酬'] },
  { categoryId: 'cat_inc_sal_annual', type: 'income', keywords: ['年终奖', '年终分红', '期权'] },
  { categoryId: 'cat_inc_salary', type: 'income', keywords: ['职业收入', '工资收入'] },

  // 理财收益
  { categoryId: 'cat_inc_inv_stock', type: 'income', keywords: ['基金', '股票', '投资收益', '赎回', '证券'] },
  { categoryId: 'cat_inc_inv_interest', type: 'income', keywords: ['利息', '结息', '活期利息', '定期利息', '存款利息', '余额宝收益', '零钱通收益'] },
  { categoryId: 'cat_inc_inv_rent', type: 'income', keywords: ['房租收入', '收租', '房租收益'] },
  { categoryId: 'cat_inc_inv_claim', type: 'income', keywords: ['理赔', '保险理赔', '赔付'] },
  { categoryId: 'cat_inc_invest', type: 'income', keywords: ['理财收益', '投资收益'] },

  // 其他收入
  { categoryId: 'cat_inc_oth_red', type: 'income', keywords: ['红包', '微信红包', '收红包', '收到红包'] },
  { categoryId: 'cat_inc_oth_refund', type: 'income', keywords: ['退款', '退款返还', '报销', '差旅报销', '公司报销'] },
  { categoryId: 'cat_inc_oth_second', type: 'income', keywords: ['二手', '闲置', '闲鱼', '转转', '二手转卖'] },
  { categoryId: 'cat_inc_oth_windfall', type: 'income', keywords: ['意外所得', '中奖', '彩票'] },
  { categoryId: 'cat_inc_oth_misc', type: 'income', keywords: ['其它入账', '其他收入'] },
  { categoryId: 'cat_inc_other', type: 'income', keywords: ['其他收入'] },

  // 转账与借贷
  { categoryId: 'cat_tr_topup', type: 'transfer', keywords: ['充值', '提现', '钱包充值', '零钱提现'] },
  { categoryId: 'cat_tr_internal', type: 'transfer', keywords: ['转账', '内部互转', '资金互转', '内部转账'] },
  { categoryId: 'cat_tr_credit', type: 'transfer', keywords: ['还信用卡', '信用卡还款', '还款'] },
  { categoryId: 'cat_tr_invest', type: 'transfer', keywords: ['理财转存', '买入基金', '理财买入'] },
  { categoryId: 'cat_tr_other', type: 'transfer', keywords: ['其他转账'] },
  { categoryId: 'cat_tr_mutual', type: 'transfer', keywords: ['资金互转'] },

  // 借贷
  { categoryId: 'cat_loan_lend', type: 'loan', keywords: ['借出', '借钱给', '借出款项'] },
  { categoryId: 'cat_loan_borrow', type: 'loan', keywords: ['借入', '借款', '借入款项'] },
  { categoryId: 'cat_loan_repay', type: 'loan', keywords: ['偿还借款', '还借款'] },
  { categoryId: 'cat_loan_collect', type: 'loan', keywords: ['收回借款', '收回欠款', '还我钱'] },
  { categoryId: 'cat_loan_social', type: 'loan', keywords: ['人情往来', '人情借还'] },
  { categoryId: 'cat_loan_platform', type: 'loan', keywords: ['平台借还', '微粒贷', '借呗', '花呗', '白条', '京东白条'] },
  { categoryId: 'cat_loan_main', type: 'loan', keywords: ['借款贷款'] },
];

/**
 * 智能匹配分类 ID
 */
export function matchCategoryByContext(
  textToMatch: string,
  type: TransactionType,
  categories: Category[]
): { categoryId: string | null; categoryName: string } {
  if (!textToMatch || !textToMatch.trim()) {
    const defaultCat = categories.find((c) => c.type === type && !c.parent_id);
    return {
      categoryId: defaultCat ? defaultCat.category_id : null,
      categoryName: defaultCat ? defaultCat.name : '默认分类',
    };
  }

  const cleanText = textToMatch.trim().toLowerCase();

  // 1. 精确匹配分类名称（小类或大类）
  const exactMatch = categories.find(
    (c) => c.type === type && (c.name.toLowerCase() === cleanText || cleanText.includes(c.name.toLowerCase()))
  );
  if (exactMatch) {
    const meta = getCategoryMeta(exactMatch.category_id, categories, type);
    return { categoryId: exactMatch.category_id, categoryName: meta.fullPath };
  }

  // 2. 规则关键词模糊匹配
  for (const rule of DEFAULT_KEYWORD_RULES) {
    if (rule.type === type) {
      if (rule.keywords.some((kw) => cleanText.includes(kw.toLowerCase()))) {
        // 检查该分类是否存在于当前用户分类表中
        const found = categories.find((c) => c.category_id === rule.categoryId);
        if (found) {
          const meta = getCategoryMeta(found.category_id, categories, type);
          return { categoryId: found.category_id, categoryName: meta.fullPath };
        }
      }
    }
  }

  // 3. 兜底匹配该类型的第一个大类或“其他”分类
  const otherCat = categories.find((c) => c.type === type && (c.name.includes('其他') || c.category_id.includes('other')));
  if (otherCat) {
    return { categoryId: otherCat.category_id, categoryName: otherCat.name };
  }

  const firstCat = categories.find((c) => c.type === type && !c.parent_id) || categories.find((c) => c.type === type);
  return {
    categoryId: firstCat ? firstCat.category_id : null,
    categoryName: firstCat ? firstCat.name : '其他',
  };
}

/**
 * 4. 导出账单为标准 CSV 格式
 */
export function exportTransactionsToCsv(
  transactions: Transaction[],
  categories: Category[],
  ledgers: Ledger[],
  options: CsvExportOptions = {}
): string {
  const ledgerMap = new Map<string, Ledger>();
  for (const l of ledgers) ledgerMap.set(l.ledger_id, l);

  // 过滤数据
  let list = transactions;
  if (options.ledgerId && options.ledgerId !== 'all') {
    list = list.filter((t) => t.ledger_id === options.ledgerId);
  }
  if (options.type && options.type !== 'all') {
    list = list.filter((t) => t.type === options.type);
  }
  if (options.startDate) {
    list = list.filter((t) => t.transaction_date >= options.startDate!);
  }
  if (options.endDate) {
    list = list.filter((t) => t.transaction_date <= options.endDate!);
  }

  // 定义表头
  const headers = [
    '交易单号',
    '记账时间',
    '所属账本',
    '收支类型',
    '金额(元)',
    '大分类',
    '小分类',
    '完整分类路径',
    '转出账户/付款方',
    '转入账户/收款方',
    '备注信息',
    '同步状态',
    '创建时间',
  ];

  const typeLabelMap: Record<TransactionType, string> = {
    expense: '支出',
    income: '收入',
    transfer: '转账',
    loan: '借贷',
  };

  const rows: (string | number)[][] = [headers];

  for (const tx of list) {
    const ledger = ledgerMap.get(tx.ledger_id);
    const ledgerName = ledger ? `${ledger.name} (${ledger.currency})` : tx.ledger_id;
    const catMeta = getCategoryMeta(tx.category_id, categories, tx.type);
    const amountYuan = toYuan(tx.amount).toFixed(2);

    rows.push([
      tx.transaction_id,
      tx.transaction_date,
      ledgerName,
      typeLabelMap[tx.type] || tx.type,
      amountYuan,
      catMeta.parentName || (catMeta.isParent ? catMeta.name : ''),
      catMeta.isParent ? '' : catMeta.name,
      catMeta.fullPath,
      tx.from_account || '',
      tx.to_account || '',
      tx.remark || '',
      tx.sync_status === 'synced' ? '已同步' : '待同步',
      tx.created_at,
    ]);
  }

  return generateCsvString(rows);
}

/**
 * 5. 导出账单为标准 JSON 备份格式
 */
export function exportTransactionsToJson(
  transactions: Transaction[],
  categories: Category[],
  ledgers: Ledger[],
  options: CsvExportOptions = {}
): string {
  let list = transactions;
  if (options.ledgerId && options.ledgerId !== 'all') {
    list = list.filter((t) => t.ledger_id === options.ledgerId);
  }
  if (options.type && options.type !== 'all') {
    list = list.filter((t) => t.type === options.type);
  }
  if (options.startDate) {
    list = list.filter((t) => t.transaction_date >= options.startDate!);
  }
  if (options.endDate) {
    list = list.filter((t) => t.transaction_date <= options.endDate!);
  }

  const customCategories = categories.filter((c) => c.user_id !== null && c.user_id !== undefined);

  const payload = {
    generator: 'Serverless-Ledger (账盾)',
    version: '1.0.0',
    export_at: new Date().toISOString(),
    filter_options: options,
    summary: {
      total_count: list.length,
      total_ledgers: ledgers.length,
      total_custom_categories: customCategories.length,
    },
    ledgers: ledgers,
    custom_categories: customCategories,
    transactions: list,
  };

  return JSON.stringify(payload, null, 2);
}

/**
 * 6. 生成标准记账 CSV 导入模板
 */
export function generateStandardCsvTemplate(): string {
  const headers = [
    '记账时间',
    '收支类型',
    '金额(元)',
    '分类名称',
    '转出账户/付款方',
    '转入账户/收款方',
    '备注信息',
  ];

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);

  const sampleRows: (string | number)[][] = [
    headers,
    [`${dateStr} 08:30:00`, '支出', '15.00', '餐饮美食 · 早餐', '微信零钱', '', '包子豆浆'],
    [`${dateStr} 12:15:00`, '支出', '32.50', '餐饮美食 · 午餐', '支付宝', '', '美团外卖黄焖鸡'],
    [`${dateStr} 18:40:00`, '支出', '5.00', '交通出行 · 地铁', '招商银行', '', '下班地铁通勤'],
    [`${dateStr} 10:00:00`, '收入', '15000.00', '薪资收入 · 基本工资', '', '招商银行', '8月份月度薪资'],
    [`${dateStr} 14:00:00`, '转账', '500.00', '转账 · 内部互转', '工商银行', '微信零钱', '银行卡充值微信'],
    [`${dateStr} 16:30:00`, '借贷', '1000.00', '借贷 · 借出款项', '招商银行', '张三', '借给张三应急'],
  ];

  return generateCsvString(sampleRows);
}

/**
 * 7. 智能多格式账单 CSV 解析器 (支持 微信支付 / 支付宝 / 账盾标准 / 通用记账)
 */
export function detectAndParseBillCsv(
  csvText: string,
  categories: Category[],
  targetLedgerId: string = 'default_ledger'
): BillParseResult {
  const rows = parseCsvString(csvText);
  const warnings: string[] = [];

  if (rows.length === 0) {
    return {
      format_type: 'generic',
      format_name: '未知或空文件',
      total_rows: 0,
      valid_rows: 0,
      invalid_rows: 0,
      total_expense: 0,
      total_income: 0,
      total_transfer: 0,
      total_loan: 0,
      items: [],
      warnings: ['上传的文件为空或未能解析出有效行'],
    };
  }

  // 1. 检测是否为微信支付账单
  const isWeChat = rows.some((row) =>
    row.some((cell) => cell.includes('微信支付账单明细') || cell.includes('微信支付账单') || cell.includes('商户单号'))
  );

  // 2. 检测是否为支付宝账单
  const isAlipay = rows.some((row) =>
    row.some((cell) => cell.includes('支付宝交易记录明细') || cell.includes('支付宝（中国）网络技术有限公司') || cell.includes('交易订单号'))
  );

  // 3. 检测是否为账盾标准 CSV
  const isStandard = rows.some((row) =>
    row.includes('交易单号') && row.includes('完整分类路径') && row.includes('收支类型')
  );

  if (isWeChat) {
    return parseWeChatPayCsv(rows, categories, targetLedgerId);
  } else if (isAlipay) {
    return parseAlipayCsv(rows, categories, targetLedgerId);
  } else if (isStandard) {
    return parseStandardLedgerCsv(rows, categories, targetLedgerId);
  } else {
    return parseGenericBillCsv(rows, categories, targetLedgerId);
  }
}

/**
 * 解析微信支付账单 CSV
 */
function parseWeChatPayCsv(rows: string[][], categories: Category[], targetLedgerId: string): BillParseResult {
  let headerIndex = -1;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.includes('交易时间') && (r.includes('交易对方') || r.includes('收/支') || r.includes('金额(元)'))) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    return parseGenericBillCsv(rows, categories, targetLedgerId);
  }

  const header = rows[headerIndex];
  const timeIdx = header.indexOf('交易时间');
  const typeColIdx = header.indexOf('交易类型');
  const peerIdx = header.indexOf('交易对方');
  const prodIdx = header.indexOf('商品');
  const inOutIdx = header.indexOf('收/支');
  const amountIdx = header.indexOf('金额(元)');
  const payMethodIdx = header.indexOf('支付方式');
  const statusIdx = header.indexOf('当前状态');
  const orderIdIdx = header.indexOf('交易单号');
  const remarkIdx = header.indexOf('备注');

  const items: ParsedBillItem[] = [];
  let totalExpense = 0;
  let totalIncome = 0;
  let totalTransfer = 0;
  let totalLoan = 0;
  let validCount = 0;
  let invalidCount = 0;

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 5) continue;

    const timeStr = row[timeIdx] || '';
    const peer = row[peerIdx] || '';
    const prod = row[prodIdx] || '';
    const inOut = row[inOutIdx] || '';
    const amountStr = (row[amountIdx] || '').replace(/[¥, ]/g, '');
    const payMethod = row[payMethodIdx] || '';
    const status = row[statusIdx] || '';
    const orderId = row[orderIdIdx] || '';
    const customRemark = row[remarkIdx] || '';

    // 跳过已关闭或已退款的无效交易
    if (status.includes('已全额退款') || status.includes('对方已退还') || status.includes('已退款') || status.includes('交易关闭')) {
      continue;
    }

    const rawAmount = parseFloat(amountStr);
    if (isNaN(rawAmount) || rawAmount <= 0) {
      invalidCount++;
      continue;
    }

    const amountInCents = toCents(rawAmount);

    let type: TransactionType = 'expense';
    if (inOut.includes('收入')) {
      type = 'income';
    } else if (inOut.includes('支出')) {
      type = 'expense';
    } else if (inOut === '/' || inOut === '其他' || inOut.includes('不计')) {
      type = 'transfer';
    }

    // 智能推断分类
    const matchContext = `${peer} ${prod} ${customRemark} ${row[typeColIdx] || ''}`;
    const matched = matchCategoryByContext(matchContext, type, categories);

    // 构造备注
    const remarkParts = [peer, prod].filter((p) => p && p !== '/').join(' - ');
    const finalRemark = customRemark && customRemark !== '/' ? `${remarkParts} (${customRemark})` : remarkParts;

    // ISO 时间标准化
    let isoDate: string;
    try {
      const d = new Date(timeStr.replace(/-/g, '/'));
      isoDate = !isNaN(d.getTime()) ? d.toISOString() : new Date().toISOString();
    } catch {
      isoDate = new Date().toISOString();
    }

    const item: ParsedBillItem = {
      id: orderId || `tx_wx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      transaction_date: isoDate,
      type,
      amount: amountInCents,
      category_id: matched.categoryId,
      category_name: matched.categoryName,
      matched_category_id: matched.categoryId,
      from_account: type === 'expense' || type === 'transfer' ? payMethod || '微信支付' : null,
      to_account: type === 'income' || type === 'transfer' ? '微信零钱' : null,
      remark: finalRemark || '微信支付消费',
      ledger_id: targetLedgerId,
      is_valid: true,
    };

    if (type === 'expense') totalExpense += amountInCents;
    else if (type === 'income') totalIncome += amountInCents;
    else if (type === 'transfer') totalTransfer += amountInCents;
    else if (type === 'loan') totalLoan += amountInCents;

    validCount++;
    items.push(item);
  }

  return {
    format_type: 'wechat',
    format_name: '微信支付账单 (WeChat Pay)',
    total_rows: items.length + invalidCount,
    valid_rows: validCount,
    invalid_rows: invalidCount,
    total_expense: totalExpense,
    total_income: totalIncome,
    total_transfer: totalTransfer,
    total_loan: totalLoan,
    items,
    warnings: [],
  };
}

/**
 * 解析支付宝账单 CSV
 */
function parseAlipayCsv(rows: string[][], categories: Category[], targetLedgerId: string): BillParseResult {
  let headerIndex = -1;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.includes('交易时间') && (r.includes('交易分类') || r.includes('收/支') || r.includes('商品说明') || r.includes('金额'))) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    return parseGenericBillCsv(rows, categories, targetLedgerId);
  }

  const header = rows[headerIndex];
  const timeIdx = header.indexOf('交易时间');
  const catIdx = header.indexOf('交易分类');
  const peerIdx = header.indexOf('交易对方');
  const prodIdx = header.indexOf('商品说明');
  const inOutIdx = header.indexOf('收/支');
  const amountIdx = header.indexOf('金额');
  const payMethodIdx = header.indexOf('收/付款方式');
  const statusIdx = header.indexOf('交易状态');
  const orderIdIdx = header.indexOf('交易订单号');
  const remarkIdx = header.indexOf('备注');

  const items: ParsedBillItem[] = [];
  let totalExpense = 0;
  let totalIncome = 0;
  let totalTransfer = 0;
  let totalLoan = 0;
  let validCount = 0;
  let invalidCount = 0;

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 5) continue;

    const timeStr = row[timeIdx] || '';
    const aliCat = row[catIdx] || '';
    const peer = row[peerIdx] || '';
    const prod = row[prodIdx] || '';
    const inOut = row[inOutIdx] || '';
    const amountStr = (row[amountIdx] || '').replace(/[¥, ]/g, '');
    const payMethod = row[payMethodIdx] || '';
    const status = row[statusIdx] || '';
    const orderId = row[orderIdIdx] || '';
    const customRemark = row[remarkIdx] || '';

    // 跳过已关闭或退款成功的交易
    if (status.includes('交易关闭') || status.includes('退款成功') || status.includes('已关闭')) {
      continue;
    }

    const rawAmount = parseFloat(amountStr);
    if (isNaN(rawAmount) || rawAmount <= 0) {
      invalidCount++;
      continue;
    }

    const amountInCents = toCents(rawAmount);

    let type: TransactionType = 'expense';
    if (inOut.includes('收入')) {
      type = 'income';
    } else if (inOut.includes('支出')) {
      type = 'expense';
    } else if (inOut.includes('不计') || inOut.includes('其他') || inOut === '') {
      type = 'transfer';
    }

    // 智能推断分类
    const matchContext = `${aliCat} ${peer} ${prod} ${customRemark}`;
    const matched = matchCategoryByContext(matchContext, type, categories);

    const remarkParts = [peer, prod].filter((p) => p && p !== '/').join(' - ');
    const finalRemark = customRemark && customRemark !== '/' ? `${remarkParts} (${customRemark})` : remarkParts;

    let isoDate: string;
    try {
      const d = new Date(timeStr.replace(/-/g, '/'));
      isoDate = !isNaN(d.getTime()) ? d.toISOString() : new Date().toISOString();
    } catch {
      isoDate = new Date().toISOString();
    }

    const item: ParsedBillItem = {
      id: orderId || `tx_ali_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      transaction_date: isoDate,
      type,
      amount: amountInCents,
      category_id: matched.categoryId,
      category_name: matched.categoryName,
      matched_category_id: matched.categoryId,
      from_account: type === 'expense' || type === 'transfer' ? payMethod || '支付宝' : null,
      to_account: type === 'income' || type === 'transfer' ? '支付宝余额' : null,
      remark: finalRemark || '支付宝交易',
      ledger_id: targetLedgerId,
      is_valid: true,
    };

    if (type === 'expense') totalExpense += amountInCents;
    else if (type === 'income') totalIncome += amountInCents;
    else if (type === 'transfer') totalTransfer += amountInCents;
    else if (type === 'loan') totalLoan += amountInCents;

    validCount++;
    items.push(item);
  }

  return {
    format_type: 'alipay',
    format_name: '支付宝交易账单 (Alipay)',
    total_rows: items.length + invalidCount,
    valid_rows: validCount,
    invalid_rows: invalidCount,
    total_expense: totalExpense,
    total_income: totalIncome,
    total_transfer: totalTransfer,
    total_loan: totalLoan,
    items,
    warnings: [],
  };
}

/**
 * 解析账盾标准 CSV
 */
function parseStandardLedgerCsv(rows: string[][], categories: Category[], targetLedgerId: string): BillParseResult {
  let headerIndex = -1;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.includes('收支类型') && r.includes('金额(元)')) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    return parseGenericBillCsv(rows, categories, targetLedgerId);
  }

  const header = rows[headerIndex];
  const idIdx = header.indexOf('交易单号');
  const timeIdx = header.indexOf('记账时间');
  const typeIdx = header.indexOf('收支类型');
  const amountIdx = header.indexOf('金额(元)');
  const pathIdx = header.indexOf('完整分类路径');
  const subCatIdx = header.indexOf('小分类');
  const mainCatIdx = header.indexOf('大分类');
  const fromIdx = header.indexOf('转出账户/付款方');
  const toIdx = header.indexOf('转入账户/收款方');
  const remarkIdx = header.indexOf('备注信息');

  const items: ParsedBillItem[] = [];
  let totalExpense = 0;
  let totalIncome = 0;
  let totalTransfer = 0;
  let totalLoan = 0;
  let validCount = 0;
  let invalidCount = 0;

  const typeReverseMap: Record<string, TransactionType> = {
    支出: 'expense',
    expense: 'expense',
    收入: 'income',
    income: 'income',
    转账: 'transfer',
    transfer: 'transfer',
    借贷: 'loan',
    loan: 'loan',
  };

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 3) continue;

    const rawId = idIdx >= 0 ? row[idIdx] : '';
    const rawTime = timeIdx >= 0 ? row[timeIdx] : '';
    const rawType = typeIdx >= 0 ? row[typeIdx] : '支出';
    const rawAmount = amountIdx >= 0 ? parseFloat(row[amountIdx]) : NaN;
    const rawCat = (pathIdx >= 0 ? row[pathIdx] : '') || (subCatIdx >= 0 ? row[subCatIdx] : '') || (mainCatIdx >= 0 ? row[mainCatIdx] : '');
    const rawFrom = fromIdx >= 0 ? row[fromIdx] : '';
    const rawTo = toIdx >= 0 ? row[toIdx] : '';
    const rawRemark = remarkIdx >= 0 ? row[remarkIdx] : '';

    if (isNaN(rawAmount) || rawAmount <= 0) {
      invalidCount++;
      continue;
    }

    const type: TransactionType = typeReverseMap[rawType.trim()] || 'expense';
    const amountInCents = toCents(rawAmount);

    let isoDate: string;
    try {
      const d = new Date(rawTime.replace(/-/g, '/'));
      isoDate = !isNaN(d.getTime()) ? d.toISOString() : new Date().toISOString();
    } catch {
      isoDate = new Date().toISOString();
    }

    const matched = matchCategoryByContext(rawCat, type, categories);

    const item: ParsedBillItem = {
      id: rawId || `tx_std_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      transaction_date: isoDate,
      type,
      amount: amountInCents,
      category_id: matched.categoryId,
      category_name: matched.categoryName,
      matched_category_id: matched.categoryId,
      from_account: rawFrom || null,
      to_account: rawTo || null,
      remark: rawRemark || null,
      ledger_id: targetLedgerId,
      is_valid: true,
    };

    if (type === 'expense') totalExpense += amountInCents;
    else if (type === 'income') totalIncome += amountInCents;
    else if (type === 'transfer') totalTransfer += amountInCents;
    else if (type === 'loan') totalLoan += amountInCents;

    validCount++;
    items.push(item);
  }

  return {
    format_type: 'standard',
    format_name: '账盾标准记账 CSV (Serverless Ledger Standard)',
    total_rows: items.length + invalidCount,
    valid_rows: validCount,
    invalid_rows: invalidCount,
    total_expense: totalExpense,
    total_income: totalIncome,
    total_transfer: totalTransfer,
    total_loan: totalLoan,
    items,
    warnings: [],
  };
}

/**
 * 解析通用第三方记账 CSV (自适应列推断)
 */
function parseGenericBillCsv(rows: string[][], categories: Category[], targetLedgerId: string): BillParseResult {
  let headerIndex = 0;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const r = rows[i].map((c) => c.toLowerCase());
    if (
      r.some((c) => c.includes('金额') || c.includes('amount') || c.includes('money')) &&
      r.some((c) => c.includes('时间') || c.includes('日期') || c.includes('date') || c.includes('time'))
    ) {
      headerIndex = i;
      break;
    }
  }

  const header = rows[headerIndex].map((c) => c.trim().toLowerCase());

  const findIdx = (keywords: string[]) => {
    for (let i = 0; i < header.length; i++) {
      if (keywords.some((kw) => header[i].includes(kw))) return i;
    }
    return -1;
  };

  const timeIdx = findIdx(['时间', '日期', 'date', 'time']);
  const typeIdx = findIdx(['类型', '收支', '方向', 'type']);
  const amountIdx = findIdx(['金额', '数额', 'amount', 'money', 'price']);
  const catIdx = findIdx(['分类', '类别', 'category', 'tag']);
  const fromIdx = findIdx(['转出', '付款账户', '账户', 'account', 'from']);
  const toIdx = findIdx(['转入', '收款账户', '对方', 'to', 'target']);
  const remarkIdx = findIdx(['备注', '说明', '描述', 'remark', 'desc', 'note', 'comment']);

  const items: ParsedBillItem[] = [];
  let totalExpense = 0;
  let totalIncome = 0;
  let totalTransfer = 0;
  let totalLoan = 0;
  let validCount = 0;
  let invalidCount = 0;

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 2) continue;

    const rawTime = timeIdx >= 0 ? row[timeIdx] : '';
    const rawType = typeIdx >= 0 ? row[typeIdx] : '支出';
    const amountStr = (amountIdx >= 0 ? row[amountIdx] : '').replace(/[¥$, ]/g, '');
    const rawCat = catIdx >= 0 ? row[catIdx] : '';
    const rawFrom = fromIdx >= 0 ? row[fromIdx] : '';
    const rawTo = toIdx >= 0 ? row[toIdx] : '';
    const rawRemark = remarkIdx >= 0 ? row[remarkIdx] : '';

    const rawAmount = parseFloat(amountStr);
    if (isNaN(rawAmount) || Math.abs(rawAmount) <= 0) {
      invalidCount++;
      continue;
    }

    let type: TransactionType = 'expense';
    let absAmount = Math.abs(rawAmount);

    if (rawType.includes('收') || rawType.toLowerCase().includes('inc')) {
      type = 'income';
    } else if (rawType.includes('转') || rawType.toLowerCase().includes('trans')) {
      type = 'transfer';
    } else if (rawType.includes('借') || rawType.toLowerCase().includes('loan')) {
      type = 'loan';
    } else if (rawType.includes('支') || rawType.toLowerCase().includes('exp')) {
      type = 'expense';
    } else if (rawAmount > 0 && (typeIdx === -1 || !rawType)) {
      type = 'expense';
    }

    const amountInCents = toCents(absAmount);

    let isoDate: string;
    try {
      const d = new Date(rawTime.replace(/-/g, '/'));
      isoDate = !isNaN(d.getTime()) ? d.toISOString() : new Date().toISOString();
    } catch {
      isoDate = new Date().toISOString();
    }

    const matched = matchCategoryByContext(`${rawCat} ${rawRemark}`, type, categories);

    const item: ParsedBillItem = {
      id: `tx_gen_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      transaction_date: isoDate,
      type,
      amount: amountInCents,
      category_id: matched.categoryId,
      category_name: matched.categoryName,
      matched_category_id: matched.categoryId,
      from_account: rawFrom || null,
      to_account: rawTo || null,
      remark: rawRemark || rawCat || '记账导入明细',
      ledger_id: targetLedgerId,
      is_valid: true,
    };

    if (type === 'expense') totalExpense += amountInCents;
    else if (type === 'income') totalIncome += amountInCents;
    else if (type === 'transfer') totalTransfer += amountInCents;
    else if (type === 'loan') totalLoan += amountInCents;

    validCount++;
    items.push(item);
  }

  return {
    format_type: 'generic',
    format_name: '通用记账 CSV (Generic CSV)',
    total_rows: items.length + invalidCount,
    valid_rows: validCount,
    invalid_rows: invalidCount,
    total_expense: totalExpense,
    total_income: totalIncome,
    total_transfer: totalTransfer,
    total_loan: totalLoan,
    items,
    warnings: ['采用自适应列名匹配解析'],
  };
}
