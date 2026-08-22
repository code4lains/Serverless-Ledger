import React from 'react';
import {
  Utensils,
  Coffee,
  UtensilsCrossed,
  Pizza,
  CupSoda,
  Carrot,
  Apple,
  Fish,
  Milk,
  IceCream,
  Beer,
  Wine,
  Cake,
  Car,
  Bus,
  Train,
  Navigation,
  Fuel,
  CircleParking,
  Bike,
  Plane,
  Ship,
  Compass,
  ShoppingBag,
  ShoppingCart,
  Package,
  Shirt,
  Smartphone,
  Sparkles,
  Truck,
  Gem,
  Glasses,
  Film,
  Gamepad2,
  Dumbbell,
  PartyPopper,
  Music,
  Tv,
  Ticket,
  Trophy,
  Palette,
  Camera,
  Smile,
  Home,
  Building,
  Building2,
  Zap,
  Wifi,
  Sofa,
  Wrench,
  Droplet,
  Sun,
  Key,
  Bed,
  Flame,
  HeartPulse,
  Pill,
  Stethoscope,
  Activity,
  Syringe,
  Thermometer,
  Shield,
  GraduationCap,
  BookOpen,
  PenTool,
  Folder,
  FileText,
  Calculator,
  Users,
  User,
  Gift,
  HeartHandshake,
  Heart,
  Baby,
  Dog,
  Cat,
  MessageCircle,
  HelpCircle,
  AlertCircle,
  Briefcase,
  Banknote,
  Coins,
  Laptop,
  Award,
  TrendingUp,
  LineChart,
  PiggyBank,
  ShieldCheck,
  RotateCcw,
  Store,
  Wallet,
  Tag,
  DollarSign,
  Percent,
  ArrowLeftRight,
  Repeat,
  CreditCard,
  Download,
  ArrowRightLeft,
  Landmark,
  Send,
  HandCoins,
  BadgeDollarSign,
  ArrowDownRight,
  ArrowDownLeft,
  ArrowUpRight,
  Star,
  Bell,
  Flag,
  Bookmark,
  type LucideIcon,
} from 'lucide-react';

interface CategoryIconProps {
  icon?: string | null;
  className?: string;
  size?: number;
  color?: string | null;
}

export const ICON_MAP: Record<string, LucideIcon> = {
  // 餐饮美食
  Utensils,
  Coffee,
  UtensilsCrossed,
  Pizza,
  CupSoda,
  Carrot,
  Apple,
  Fish,
  Milk,
  IceCream,
  Beer,
  Wine,
  Cake,

  // 交通出行
  Car,
  Bus,
  Train,
  Navigation,
  Fuel,
  CircleParking,
  Bike,
  Plane,
  Ship,
  Compass,

  // 购物消费
  ShoppingBag,
  ShoppingCart,
  Package,
  Shirt,
  Smartphone,
  Sparkles,
  Truck,
  Gem,
  Glasses,

  // 休闲娱乐
  Film,
  Gamepad2,
  Dumbbell,
  PartyPopper,
  Music,
  Tv,
  Ticket,
  Trophy,
  Palette,
  Camera,
  Smile,

  // 居住生活
  Home,
  Building,
  Building2,
  Zap,
  Wifi,
  Sofa,
  Wrench,
  Droplet,
  Sun,
  Key,
  Bed,
  Flame,

  // 医疗保健
  HeartPulse,
  Pill,
  Stethoscope,
  Activity,
  Syringe,
  Thermometer,
  Shield,

  // 学习进修 / 办公
  GraduationCap,
  BookOpen,
  PenTool,
  Folder,
  FileText,
  Calculator,

  // 人情社交 / 家庭
  Users,
  User,
  Gift,
  HeartHandshake,
  Heart,
  Baby,
  Dog,
  Cat,
  MessageCircle,

  // 职业收入 / 财务
  Briefcase,
  Banknote,
  Coins,
  Laptop,
  Award,
  TrendingUp,
  LineChart,
  PiggyBank,
  ShieldCheck,
  Wallet,
  DollarSign,
  Percent,

  // 转账与借贷
  ArrowLeftRight,
  Repeat,
  CreditCard,
  Download,
  ArrowRightLeft,
  Landmark,
  Send,
  HandCoins,
  BadgeDollarSign,
  RotateCcw,
  Store,
  Tag,
  ArrowDownRight,
  ArrowDownLeft,
  ArrowUpRight,

  // 其他 / 标记
  Star,
  Bell,
  Flag,
  Bookmark,
  HelpCircle,
  AlertCircle,
};

/**
 * 分组预置图标列表（供分类创建/编辑弹窗选择）
 */
export const CATEGORY_ICON_GROUPS: { groupName: string; icons: string[] }[] = [
  {
    groupName: '餐饮美食',
    icons: ['Utensils', 'Coffee', 'UtensilsCrossed', 'Pizza', 'CupSoda', 'Carrot', 'Apple', 'Fish', 'Milk', 'IceCream', 'Beer', 'Wine', 'Cake'],
  },
  {
    groupName: '交通出行',
    icons: ['Car', 'Bus', 'Train', 'Navigation', 'Fuel', 'CircleParking', 'Bike', 'Plane', 'Ship', 'Compass'],
  },
  {
    groupName: '购物消费',
    icons: ['ShoppingBag', 'ShoppingCart', 'Package', 'Shirt', 'Smartphone', 'Sparkles', 'Truck', 'Gem', 'Glasses'],
  },
  {
    groupName: '休闲文娱',
    icons: ['Gamepad2', 'Film', 'Dumbbell', 'Music', 'Tv', 'PartyPopper', 'Ticket', 'Trophy', 'Palette', 'Camera', 'Smile'],
  },
  {
    groupName: '居家生活',
    icons: ['Home', 'Building', 'Building2', 'Zap', 'Wifi', 'Sofa', 'Wrench', 'Droplet', 'Sun', 'Key', 'Bed', 'Flame'],
  },
  {
    groupName: '医疗健康',
    icons: ['HeartPulse', 'Pill', 'Stethoscope', 'Activity', 'Syringe', 'Thermometer', 'Shield'],
  },
  {
    groupName: '学习办公',
    icons: ['GraduationCap', 'BookOpen', 'PenTool', 'Folder', 'FileText', 'Calculator', 'Laptop', 'Briefcase'],
  },
  {
    groupName: '社交与宠物',
    icons: ['Users', 'User', 'Gift', 'HeartHandshake', 'Heart', 'Baby', 'Dog', 'Cat', 'MessageCircle'],
  },
  {
    groupName: '财务与资产',
    icons: ['Banknote', 'Coins', 'TrendingUp', 'LineChart', 'PiggyBank', 'ShieldCheck', 'Wallet', 'DollarSign', 'Landmark', 'CreditCard'],
  },
  {
    groupName: '常用标记',
    icons: ['Tag', 'Star', 'Bell', 'Flag', 'Bookmark', 'HelpCircle', 'AlertCircle', 'Award'],
  },
];

/**
 * 莫兰迪 / 极简预置色彩
 */
export const PRESET_CATEGORY_COLORS = [
  '#D08770', // 莫兰迪橘
  '#EBCB8B', // 莫兰迪黄
  '#A3BE8C', // 莫兰迪绿
  '#88C0D0', // 莫兰迪蓝
  '#81A1C1', // 莫兰迪深蓝
  '#B48EAD', // 莫兰迪紫
  '#3B82F6', // 经典蓝
  '#10B981', // 翡翠绿
  '#F59E0B', // 琥珀黄
  '#EF4444', // 珊瑚红
  '#EC4899', // 玫瑰粉
  '#8B5CF6', // 紫罗兰
  '#6B7280', // 质感灰
  '#1F2937', // 深灰黑
];

export function CategoryIcon({ icon, className = 'w-4 h-4', size, color }: CategoryIconProps) {
  const IconComponent = (icon && ICON_MAP[icon]) ? ICON_MAP[icon] : Tag;
  const style = color ? { color } : undefined;
  return <IconComponent className={className} size={size} style={style} />;
}
