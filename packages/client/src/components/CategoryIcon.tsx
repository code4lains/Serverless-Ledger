import React from 'react';
import {
  Utensils,
  Coffee,
  UtensilsCrossed,
  Pizza,
  CupSoda,
  Car,
  Train,
  Navigation,
  Fuel,
  ShoppingBag,
  Package,
  Shirt,
  Smartphone,
  Film,
  Gamepad2,
  Dumbbell,
  Plane,
  Home,
  Building,
  Zap,
  Briefcase,
  Banknote,
  Coins,
  Laptop,
  TrendingUp,
  LineChart,
  PiggyBank,
  Gift,
  RotateCcw,
  Wallet,
  Tag,
} from 'lucide-react';

interface CategoryIconProps {
  icon?: string | null;
  className?: string;
  size?: number;
}

export function CategoryIcon({ icon, className = 'w-4 h-4', size }: CategoryIconProps) {
  const iconProps = { className, size };

  switch (icon) {
    // 餐饮
    case 'Utensils':
      return <Utensils {...iconProps} />;
    case 'Coffee':
      return <Coffee {...iconProps} />;
    case 'UtensilsCrossed':
      return <UtensilsCrossed {...iconProps} />;
    case 'Pizza':
      return <Pizza {...iconProps} />;
    case 'CupSoda':
      return <CupSoda {...iconProps} />;

    // 交通
    case 'Car':
      return <Car {...iconProps} />;
    case 'Train':
      return <Train {...iconProps} />;
    case 'Navigation':
      return <Navigation {...iconProps} />;
    case 'Fuel':
      return <Fuel {...iconProps} />;

    // 购物
    case 'ShoppingBag':
      return <ShoppingBag {...iconProps} />;
    case 'Package':
      return <Package {...iconProps} />;
    case 'Shirt':
      return <Shirt {...iconProps} />;
    case 'Smartphone':
      return <Smartphone {...iconProps} />;

    // 娱乐
    case 'Film':
      return <Film {...iconProps} />;
    case 'Gamepad2':
      return <Gamepad2 {...iconProps} />;
    case 'Dumbbell':
      return <Dumbbell {...iconProps} />;
    case 'Plane':
      return <Plane {...iconProps} />;

    // 居住
    case 'Home':
      return <Home {...iconProps} />;
    case 'Building':
      return <Building {...iconProps} />;
    case 'Zap':
      return <Zap {...iconProps} />;

    // 收入
    case 'Briefcase':
      return <Briefcase {...iconProps} />;
    case 'Banknote':
      return <Banknote {...iconProps} />;
    case 'Coins':
      return <Coins {...iconProps} />;
    case 'Laptop':
      return <Laptop {...iconProps} />;
    case 'TrendingUp':
      return <TrendingUp {...iconProps} />;
    case 'LineChart':
      return <LineChart {...iconProps} />;
    case 'PiggyBank':
      return <PiggyBank {...iconProps} />;
    case 'Gift':
      return <Gift {...iconProps} />;
    case 'RotateCcw':
      return <RotateCcw {...iconProps} />;

    default:
      return <Tag {...iconProps} />;
  }
}
