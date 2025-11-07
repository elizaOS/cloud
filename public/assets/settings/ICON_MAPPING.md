# Icon Mapping Guide

Since your project already uses `lucide-react`, here's the recommended mapping from Figma icons to Lucide icons:

## Tab Navigation Icons

| Figma Asset            | Lucide Icon               | Usage         |
| ---------------------- | ------------------------- | ------------- |
| `icon-user-tab.svg`    | `User`                    | General tab   |
| `icon-building.svg`    | `Building2` or `Building` | Account tab   |
| `icon-bar-chart.svg`   | `BarChart3` or `BarChart` | Usage tab     |
| `icon-credit-card.svg` | `CreditCard`              | Billing tab   |
| `icon-key.svg`         | `Key`                     | APIs tab      |
| `icon-pie-chart.svg`   | `PieChart`                | Analytics tab |

## UI Element Icons

| Figma Asset             | Lucide Icon   | Usage                 |
| ----------------------- | ------------- | --------------------- |
| `icon-user-header.svg`  | `User`        | Header profile button |
| `icon-chevron-down.svg` | `ChevronDown` | Dropdown selects      |

## Example Implementation

```tsx
import {
  User,
  Building2,
  BarChart3,
  CreditCard,
  Key,
  PieChart,
  ChevronDown,
} from "lucide-react";

// Tab Navigation Example
const tabs = [
  { name: "General", icon: User },
  { name: "Account", icon: Building2 },
  { name: "Usage", icon: BarChart3 },
  { name: "Billing", icon: CreditCard },
  { name: "APIs", icon: Key },
  { name: "Analytics", icon: PieChart },
];

// Render
{
  tabs.map((tab) => (
    <button key={tab.name}>
      <tab.icon className="h-4 w-4" />
      <span>{tab.name}</span>
    </button>
  ));
}
```

## Benefits of Using Lucide Icons

1. **Already installed** - No additional dependencies
2. **Consistency** - Matches your existing components
3. **Flexibility** - Easy to customize size, color, stroke width
4. **Tree-shakeable** - Only imports what you use
5. **SVG-based** - Crisp at any size
6. **Accessible** - Built-in ARIA attributes

## Color Scheme from Figma

- **Active tab:** `#FFFFFF` (white)
- **Inactive tab:** `#A2A2A2` (gray)
- **Active border:** `#FFFFFF` with 2px bottom border
- **Orange accent:** `#FF5800` (already used throughout your app)
