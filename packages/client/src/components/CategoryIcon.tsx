import React from 'react';
import {
  Utensils,
  Coffee,
  UtensilsCrossed,
  Pizza,
  CupSoda,
  Carrot,
  Apple,
  Car,
  Train,
  Navigation,
  Fuel,
  CircleParking,
  Bike,
  Plane,
  ShoppingBag,
  Package,
  Shirt,
  Smartphone,
  Sparkles,
  Truck,
  Film,
  Gamepad2,
  Dumbbell,
  PartyPopper,
  Home,
  Building,
  Building2,
  Zap,
  Wifi,
  Sofa,
  Wrench,
  HeartPulse,
  Pill,
  Stethoscope,
  Activity,
  GraduationCap,
  BookOpen,
  PenTool,
  Users,
  Gift,
  HeartHandshake,
  Heart,
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
  type LucideIcon,
} from 'lucide-react';

interface CategoryIconProps {
  icon?: string | null;
  className?: string;
  size?: number;
}

const ICON_MAP: Record<string, LucideIcon> = {
  // 餐饮美食
  Utensils,
  Coffee,
  UtensilsCrossed,
  Pizza,
  CupSoda,
  Carrot,
  Apple,

  // 交通出行
  Car,
  Train,
  Navigation,
  Fuel,
  CircleParking,
  Bike,
  Plane,

  // 购物消费
  ShoppingBag,
  Package,
  Shirt,
  Smartphone,
  Sparkles,
  Truck,

  // 休闲娱乐
  Film,
  Gamepad2,
  Dumbbell,
  PartyPopper,

  // 居住生活
  Home,
  Building,
  Building2,
  Zap,
  Wifi,
  Sofa,
  Wrench,

  // 医疗保健
  HeartPulse,
  Pill,
  Stethoscope,
  Activity,

  // 学习进修
  GraduationCap,
  BookOpen,
  PenTool,

  // 人情社交
  Users,
  Gift,
  HeartHandshake,
  Heart,

  // 其他支出
  HelpCircle,
  AlertCircle,

  // 职业收入
  Briefcase,
  Banknote,
  Coins,
  Laptop,
  Award,

  // 理财收益
  TrendingUp,
  LineChart,
  PiggyBank,
  ShieldCheck,

  // 其他收入 / 通用
  RotateCcw,
  Store,
  Wallet,
  Tag,

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
  ArrowDownRight,
  ArrowDownLeft,
  ArrowUpRight,
};

export function CategoryIcon({ icon, className = 'w-4 h-4', size }: CategoryIconProps) {
  const IconComponent = (icon && ICON_MAP[icon]) ? ICON_MAP[icon] : Tag;
  return <IconComponent className={className} size={size} />;
}
