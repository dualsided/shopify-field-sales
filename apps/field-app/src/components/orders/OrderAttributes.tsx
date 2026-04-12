'use client';

interface OrderAttributesProps {
  poNumber: string;
  note: string;
  onPoNumberChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  readonly?: boolean;
}

export function OrderAttributes({
  poNumber,
  note,
  onPoNumberChange,
  onNoteChange,
  readonly = false,
}: OrderAttributesProps) {
  if (readonly) {
    return (
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-4">Order Details</h2>

        <div className="space-y-4">
          {/* PO Number */}
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500 mb-1">PO Number</p>
            <p className="text-gray-900">{poNumber || 'Not provided'}</p>
          </div>

          {/* Notes */}
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500 mb-1">Notes</p>
            <p className="text-gray-900 whitespace-pre-wrap">
              {note || 'No notes'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h2 className="font-semibold text-gray-900 mb-4">Order Details</h2>

      <div className="space-y-4">
        {/* PO Number */}
        <div>
          <label
            htmlFor="poNumber"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            PO Number
          </label>
          <input
            id="poNumber"
            type="text"
            value={poNumber}
            onChange={(e) => onPoNumberChange(e.target.value)}
            placeholder="Enter PO number (optional)"
            className="input"
          />
        </div>

        {/* Notes */}
        <div>
          <label
            htmlFor="note"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Notes
          </label>
          <textarea
            id="note"
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder="Add any notes for this order..."
            rows={3}
            className="input resize-none"
          />
        </div>
      </div>
    </div>
  );
}

export default OrderAttributes;
