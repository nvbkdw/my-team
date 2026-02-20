import { cn } from '../../utils/cn.js';

interface Tab {
  key: string;
  label: string;
}

interface TabsProps {
  tabs: Tab[];
  activeKey: string;
  onChange: (key: string) => void;
}

export default function Tabs({ tabs, activeKey, onChange }: TabsProps) {
  return (
    <div className="flex border-b border-gray-200">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={cn(
            'relative px-4 py-2 text-sm font-medium transition-colors',
            'hover:text-indigo-600',
            activeKey === tab.key
              ? 'text-indigo-600'
              : 'text-gray-500',
          )}
        >
          {tab.label}
          {activeKey === tab.key && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-full" />
          )}
        </button>
      ))}
    </div>
  );
}
