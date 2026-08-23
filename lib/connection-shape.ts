type ConnectionLike = {
  id: string;
  requesterId?: string;
  requester_id?: string;
  recipientId?: string;
  recipient_id?: string;
  howMet?: string | null;
  how_met?: string | null;
  status?: string | null;
  connectionType?: string | null;
  connection_type?: string | null;
  upgradeRequestedType?: string | null;
  upgrade_requested_type?: string | null;
  upgradeRequestedBy?: string | null;
  upgrade_requested_by?: string | null;
  createdAt?: Date | string | null;
  created_at?: Date | string | null;
  updatedAt?: Date | string | null;
  updated_at?: Date | string | null;
};

function serializeDate(value: Date | string | null | undefined) {
  return value instanceof Date ? value.toISOString() : (value ?? null);
}

export function toClientConnectionRow<T extends ConnectionLike>(row: T) {
  return {
    ...row,
    requester_id: row.requester_id ?? row.requesterId ?? "",
    recipient_id: row.recipient_id ?? row.recipientId ?? "",
    how_met: row.how_met ?? row.howMet ?? null,
    connection_type: row.connection_type ?? row.connectionType ?? null,
    upgrade_requested_type:
      row.upgrade_requested_type ?? row.upgradeRequestedType ?? null,
    upgrade_requested_by:
      row.upgrade_requested_by ?? row.upgradeRequestedBy ?? null,
    created_at: serializeDate(row.created_at ?? row.createdAt),
    updated_at: serializeDate(row.updated_at ?? row.updatedAt),
  };
}
