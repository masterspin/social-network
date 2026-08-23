"use client";

import { useEffect, useMemo, useState } from "react";
import { getCurrentUser } from "@/lib/supabase/queries";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { Users } from "lucide-react";

type User = {
  id: string;
  name: string;
  preferred_name: string | null;
  profile_image_url: string | null;
};

type MatchMakerProps = {
  onClose?: () => void;
  onMatchCreated?: () => void;
};

type AcceptedConnection = {
  connection_type?: string | null;
  other_user: User | null;
};

export default function MatchMaker({ onClose, onMatchCreated }: MatchMakerProps) {
  const { toast } = useToast();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [connections, setConnections] = useState<User[]>([]);
  const [selectedUser1, setSelectedUser1] = useState<string>("");
  const [selectedUser2, setSelectedUser2] = useState<string>("");
  const [searchTerm1, setSearchTerm1] = useState("");
  const [searchTerm2, setSearchTerm2] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    async function loadConnections() {
      const { user } = await getCurrentUser();
      if (!user) { setLoading(false); return; }
      setCurrentUserId(user.id);

      try {
        const res = await fetch(`/api/connections/accepted?userId=${encodeURIComponent(user.id)}`);
        const json = await res.json();
        if (!res.ok) {
          toast(json?.error?.message || "Failed to load connections", "error");
          setLoading(false);
          return;
        }
        const firstConnections = ((json.data || []) as AcceptedConnection[])
          .filter((conn) => conn.connection_type === "first")
          .map((conn) => conn.other_user)
          .filter((u): u is User => u !== null);
        setConnections(firstConnections);
        setLoading(false);
      } catch (e) {
        toast((e as Error).message, "error");
        setLoading(false);
      }
    }
    loadConnections();
  }, [toast]);

  async function createMatch(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUserId || !selectedUser1 || !selectedUser2 || creating) return;
    if (selectedUser1 === selectedUser2) {
      toast("Please select two different people", "error");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchmaker_id: currentUserId,
          user1_id: selectedUser1,
          user2_id: selectedUser2,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast(json?.error || "Failed to create match", "error");
        setCreating(false);
        return;
      }
      toast("Match created successfully!");
      setSelectedUser1("");
      setSelectedUser2("");
      setCreating(false);
      if (onMatchCreated) setTimeout(() => onMatchCreated(), 1500);
    } catch (e) {
      toast((e as Error).message, "error");
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 gap-3">
        <Spinner size="md" />
        <span className="text-sm text-gray-500">Loading connections...</span>
      </div>
    );
  }

  return (
    <div>
      {connections.length < 2 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
            <Users className="w-5 h-5 text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Not enough connections</p>
          <p className="text-xs text-gray-500 mt-1">You need at least 2 first connections to create a match.</p>
        </div>
      ) : (
        <form onSubmit={createMatch} className="space-y-6">
          <SearchablePicker
            label="Select first person"
            searchTerm={searchTerm1}
            onSearchChange={setSearchTerm1}
            connections={connections}
            selectedId={selectedUser1}
            onSelect={(id) => {
              setSelectedUser1(id);
              setSearchTerm1("");
              if (id === selectedUser2) setSelectedUser2("");
            }}
            excludeIds={selectedUser2 ? [selectedUser2] : []}
          />

          <SearchablePicker
            label="Select second person"
            searchTerm={searchTerm2}
            onSearchChange={setSearchTerm2}
            connections={connections}
            selectedId={selectedUser2}
            onSelect={(id) => { setSelectedUser2(id); setSearchTerm2(""); }}
            excludeIds={selectedUser1 ? [selectedUser1] : []}
            disabled={!selectedUser1}
            helperText={!selectedUser1 ? "Select the first person before choosing a second" : undefined}
          />

          <div className="flex gap-2">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={creating || !selectedUser1 || !selectedUser2}
              className="flex-1"
            >
              {creating ? "Creating..." : "Create Match"}
            </Button>
            {onClose && (
              <Button type="button" variant="secondary" size="lg" onClick={onClose}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

type SearchablePickerProps = {
  label: string;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  connections: User[];
  selectedId: string;
  onSelect: (id: string) => void;
  excludeIds?: string[];
  disabled?: boolean;
  helperText?: string;
};

function SearchablePicker({
  label,
  searchTerm,
  onSearchChange,
  connections,
  selectedId,
  onSelect,
  excludeIds = [],
  disabled = false,
  helperText,
}: SearchablePickerProps) {
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const hasSearch = normalizedSearch.length > 0;

  const availableConnections = useMemo(
    () => connections.filter((conn) => !excludeIds.includes(conn.id)),
    [connections, excludeIds]
  );

  const filteredConnections = useMemo(() => {
    if (!hasSearch) return [];
    return availableConnections
      .filter((conn) => {
        const target = `${conn.preferred_name || conn.name}`.trim().toLowerCase();
        return target.includes(normalizedSearch);
      })
      .slice(0, 20);
  }, [availableConnections, hasSearch, normalizedSearch]);

  const selectedConnection = useMemo(
    () => availableConnections.find((conn) => conn.id === selectedId),
    [availableConnections, selectedId]
  );

  return (
    <div className={disabled ? "opacity-60" : undefined}>
      <Input
        label={label}
        type="text"
        value={searchTerm}
        onChange={(e) => onSearchChange(e.target.value)}
        disabled={disabled}
        placeholder="Search by name"
      />
      {helperText && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{helperText}</p>
      )}

      {hasSearch && (
        <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700/50">
          {filteredConnections.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-500">
              No matches found. Try a different search.
            </div>
          ) : (
            filteredConnections.map((conn) => {
              const displayName = conn.preferred_name || conn.name;
              const isSelected = selectedId === conn.id;
              return (
                <button
                  key={conn.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelect(conn.id)}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                    isSelected
                      ? "bg-indigo-600 text-white"
                      : "hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-200"
                  }`}
                >
                  <span className="block font-medium">{displayName}</span>
                </button>
              );
            })
          )}
        </div>
      )}

      {selectedConnection && (
        <div className="mt-2 flex items-center justify-between rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20 px-3 py-2 text-sm text-indigo-700 dark:text-indigo-300">
          <span>
            {selectedConnection.preferred_name || selectedConnection.name}
          </span>
          <button
            type="button"
            onClick={() => onSelect("")}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-200"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
