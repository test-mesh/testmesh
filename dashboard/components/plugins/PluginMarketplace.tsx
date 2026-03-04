'use client';

import React, { useState, useEffect } from 'react';
import { Search, Download, Star, Check, ExternalLink, Package, Filter } from 'lucide-react';

interface Plugin {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  category: string;
  downloads: number;
  rating: number;
  installed: boolean;
  verified: boolean;
  tags: string[];
  repository?: string;
}

interface PluginMarketplaceProps {
  apiUrl?: string;
}

const CATEGORIES = [
  'All',
  'Actions',
  'Assertions',
  'Integrations',
  'Reporting',
  'Authentication',
  'Database',
  'Messaging',
];

export function PluginMarketplace({ apiUrl = '/api/v1' }: PluginMarketplaceProps) {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [filteredPlugins, setFilteredPlugins] = useState<Plugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [installing, setInstalling] = useState<string | null>(null);

  useEffect(() => {
    fetchPlugins();
  }, []);

  useEffect(() => {
    filterPlugins();
  }, [plugins, search, category]);

  const fetchPlugins = async () => {
    try {
      const response = await fetch(`${apiUrl}/plugins/marketplace`);
      if (response.ok) {
        const data = await response.json();
        setPlugins(data.plugins || []);
      }
    } catch (error) {
      console.error('Failed to fetch plugins:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterPlugins = () => {
    let filtered = plugins;

    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(searchLower) ||
          p.description.toLowerCase().includes(searchLower) ||
          p.tags.some((t) => t.toLowerCase().includes(searchLower))
      );
    }

    if (category !== 'All') {
      filtered = filtered.filter((p) => p.category === category);
    }

    setFilteredPlugins(filtered);
  };

  const installPlugin = async (pluginId: string) => {
    setInstalling(pluginId);
    try {
      const response = await fetch(`${apiUrl}/plugins/${pluginId}/install`, {
        method: 'POST',
      });
      if (response.ok) {
        setPlugins((prev) =>
          prev.map((p) => (p.id === pluginId ? { ...p, installed: true } : p))
        );
      }
    } catch (error) {
      console.error('Failed to install plugin:', error);
    } finally {
      setInstalling(null);
    }
  };

  const uninstallPlugin = async (pluginId: string) => {
    setInstalling(pluginId);
    try {
      const response = await fetch(`${apiUrl}/plugins/${pluginId}/uninstall`, {
        method: 'POST',
      });
      if (response.ok) {
        setPlugins((prev) =>
          prev.map((p) => (p.id === pluginId ? { ...p, installed: false } : p))
        );
      }
    } catch (error) {
      console.error('Failed to uninstall plugin:', error);
    } finally {
      setInstalling(null);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Plugin Marketplace</h1>
        <p className="text-gray-600">
          Extend TestMesh with plugins for additional actions, assertions, and integrations.
        </p>
      </div>

      {/* Search and filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search plugins..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Plugin grid */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPlugins.map((plugin) => (
            <PluginCard
              key={plugin.id}
              plugin={plugin}
              installing={installing === plugin.id}
              onInstall={() => installPlugin(plugin.id)}
              onUninstall={() => uninstallPlugin(plugin.id)}
            />
          ))}

          {filteredPlugins.length === 0 && (
            <div className="col-span-full text-center py-12 text-gray-500">
              <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No plugins found matching your criteria.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface PluginCardProps {
  plugin: Plugin;
  installing: boolean;
  onInstall: () => void;
  onUninstall: () => void;
}

function PluginCard({ plugin, installing, onInstall, onUninstall }: PluginCardProps) {
  return (
    <div className="border rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{plugin.name}</h3>
            {plugin.verified && (
              <span className="bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded flex items-center gap-0.5">
                <Check className="w-3 h-3" /> Verified
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500">by {plugin.author}</p>
        </div>
        <span className="text-xs bg-gray-100 px-2 py-1 rounded">{plugin.category}</span>
      </div>

      <p className="text-sm text-gray-600 mb-3 line-clamp-2">{plugin.description}</p>

      <div className="flex items-center gap-4 text-sm text-gray-500 mb-3">
        <span className="flex items-center gap-1">
          <Download className="w-4 h-4" /> {formatNumber(plugin.downloads)}
        </span>
        <span className="flex items-center gap-1">
          <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" /> {plugin.rating.toFixed(1)}
        </span>
        <span>v{plugin.version}</span>
      </div>

      <div className="flex flex-wrap gap-1 mb-3">
        {plugin.tags.slice(0, 3).map((tag) => (
          <span key={tag} className="text-xs bg-gray-100 px-2 py-0.5 rounded">
            {tag}
          </span>
        ))}
      </div>

      <div className="flex gap-2">
        {plugin.installed ? (
          <button
            onClick={onUninstall}
            disabled={installing}
            className="flex-1 px-3 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {installing ? 'Uninstalling...' : 'Uninstall'}
          </button>
        ) : (
          <button
            onClick={onInstall}
            disabled={installing}
            className="flex-1 px-3 py-1.5 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 disabled:opacity-50"
          >
            {installing ? 'Installing...' : 'Install'}
          </button>
        )}

        {plugin.repository && (
          <a
            href={plugin.repository}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
      </div>
    </div>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

export default PluginMarketplace;
