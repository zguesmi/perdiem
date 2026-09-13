import { useEffect, useState } from "react";

import { formatUsdc, short } from "../auction.ts";
import { bookingPath, hotelPath, readBooking, type Booking } from "../booking.ts";
import { Field, Panel, type PanelProps } from "./panel.tsx";

/** The two things that leave the confidential handler. Everything it scored stays inside it. */
export function Enclave({ auction }: PanelProps) {
  const settlement = auction.settlement;
  const bookingId = settlement?.bookingId;
  const booking = useBooking(bookingId);

  return (
    <Panel
      title="Enclave"
      note="Scoring and booking run inside the confidential handler. The policy is loaded there and logged nowhere."
    >
      <Field label="Bids root" value={<code>{short(auction.bidsRoot)}</code>} />
      {settlement && bookingId ? (
        <>
          <Field label="Hotel" value={booking?.hotelName ?? "Reading the booking…"} />
          {booking && <Field label="Hotel id" value={<code>{booking.hotelId}</code>} />}
          <Field
            label="Booking"
            value={
              <a href={bookingPath(bookingId)} target="_blank" rel="noreferrer">
                <code>{bookingId}</code>
              </a>
            }
          />
          {/* The chain's number, not the booking's: the supplier keeps or eats the difference. */}
          <Field label="Paid" value={formatUsdc(settlement.payout)} />
          {booking && (
            <p className="note">
              <a href={hotelPath(booking.hotelId)} target="_blank" rel="noreferrer">
                The hotel record
              </a>
            </p>
          )}
        </>
      ) : (
        <p className="note">
          No booking yet. The contract pays only against a matching policy hash, a matching bids
          root and a booking id.
        </p>
      )}
    </Panel>
  );
}

/** The booking record, once per booking id. It never changes, so one read answers every poll. */
function useBooking(bookingId?: string): Booking | undefined {
  const [read, setRead] = useState<{ bookingId: string; booking?: Booking }>();

  useEffect(() => {
    if (!bookingId) {
      return;
    }
    let current = true;
    void readBooking(bookingId).then((booking) => {
      if (current) {
        setRead({ bookingId, booking });
      }
    });
    return () => {
      current = false;
    };
  }, [bookingId]);

  // By identifier, so the previous auction's hotel is never shown against this one's booking.
  return read && read.bookingId === bookingId ? read.booking : undefined;
}
