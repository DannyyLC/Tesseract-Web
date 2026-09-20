/**
 * Traducciones al inglés del seed global. Van aparte de `seed-data.ts` a propósito: los textos
 * base (español) siguen siendo la fuente y el fallback, y esto solo llena las columnas `…En`.
 * Lo que no aparezca aquí queda en NULL y se muestra en español.
 */

export const toolTranslationsEn: Record<
  string,
  {
    displayName: string;
    description: string;
    functions: Record<string, { displayName: string; description: string }>;
  }
> = {
  calculator: {
    displayName: 'Calculator',
    description: 'Math calculation tool. Supports basic operations, percentages and currency conversions.',
    functions: {
      calculator: {
        displayName: 'Calculate expression',
        description: 'Safely evaluates math expressions. Supports +, -, *, /, parentheses, decimals, modulo and powers.',
      },
      percentage: { displayName: 'Calculate percentage', description: 'Calculates the percentage of a value.' },
      currency_convert: {
        displayName: 'Convert currency',
        description: 'Converts between currencies (mock version for testing).',
      },
    },
  },
  human_handoff: {
    displayName: 'Human Handoff',
    description: 'Escalates the conversation to a human when the agent detects a team member is needed.',
    functions: {
      request_human_handoff: {
        displayName: 'Request human intervention',
        description: 'Flags the conversation for Human in the Loop and notifies the organization members.',
      },
    },
  },
  send_bulk_whatsapp: {
    displayName: 'WhatsApp Outbound',
    description: 'Sends WhatsApp template messages to multiple recipients using Meta pre-approved templates.',
    functions: {
      send_bulk_whatsapp: {
        displayName: 'Send bulk messages',
        description: 'Sends WhatsApp template messages to a list of recipients. The sender number is always set by the system.',
      },
    },
  },
  dataset: {
    displayName: 'Your data',
    description: 'Queries the catalogs the organization captures in Tesseract: products, vehicles, services or any custom table.',
    functions: {
      search_dataset: {
        displayName: 'Search the catalog',
        description: 'Searches catalog rows combining column filters and free text. Returns the total matches and the first rows.',
      },
      get_dataset_item: {
        displayName: 'View a full record',
        description: 'Returns all the data of a catalog row given its id.',
      },
      list_dataset_values: {
        displayName: 'List a column\'s values',
        description: 'Returns the distinct values of a column with their count. Useful to answer which options exist when there are too many to fit in the search signature.',
      },
    },
  },
  google_calendar: {
    displayName: 'Google Calendar',
    description: 'Calendar and event management in Google Calendar.',
    functions: {
      check_calendar_availability: { displayName: 'Check availability', description: 'Checks whether a time slot is available on the calendar.' },
      create_calendar_event: { displayName: 'Create event', description: 'Creates a new event in Google Calendar.' },
      list_calendar_events: { displayName: 'List events', description: 'Lists events within a date range.' },
      update_calendar_event: { displayName: 'Update event', description: 'Updates an existing event in Google Calendar.' },
      delete_calendar_event: { displayName: 'Delete event', description: 'Deletes an event from Google Calendar.' },
      get_calendar_event_details: { displayName: 'Get event details', description: 'Gets the full details of an event.' },
    },
  },
  google_sheets: {
    displayName: 'Google Sheets',
    description: 'Management and manipulation of spreadsheets in Google Sheets.',
    functions: {
      read_sheet: { displayName: 'Read spreadsheet', description: 'Reads data from a Google Sheets spreadsheet.' },
      append_row: { displayName: 'Append row', description: 'Appends a row at the end of a spreadsheet.' },
      update_sheet_range: { displayName: 'Update range', description: 'Updates or overwrites a range of cells.' },
      create_spreadsheet: { displayName: 'Create spreadsheet', description: 'Creates a new spreadsheet file.' },
      add_sheet: { displayName: 'Add tab', description: 'Adds a new tab inside the spreadsheet.' },
      delete_sheet: { displayName: 'Delete tab', description: 'Deletes an entire tab from the spreadsheet.' },
      clear_sheet_range: { displayName: 'Clear range', description: 'Clears the contents of a range.' },
      format_cells: { displayName: 'Format cells', description: 'Applies formatting (color, styles, etc.) to a range.' },
    },
  },
};

export const notificationTranslationsEn: Record<string, { title: string; message: string }> = {
  '0000-0001': {
    title: 'Subscription',
    message: 'Congratulations, you now have the %s subscription, which starts today %s. The next payment will be made automatically on %s if you wish to continue enjoying the plan\'s benefits. We are very happy to have you in our app, as you are a fundamental part of it. Thank you for your trust.',
  },
  '0000-0010': {
    title: 'Email Invitation.',
    message: 'The invitation for %s was successfully sent. As soon as the invited email accepts the invitation, we will let you know through a notification.',
  },
  '0000-0011': {
    title: 'Invitation Cancelled.',
    message: 'The invitation for %s has been successfully resent, please check your email.',
  },
  '0000-0100': {
    title: 'Subscription Cancelled.',
    message: 'The %s subscription has been cancelled. Thank you very much, keep enjoying our services on the free plan.',
  },
  '0000-0101': {
    title: 'Subscription Change.',
    message: 'The %s subscription has been changed (its benefits will still not be cancelled until the start of the next subscription). Thank you very much, keep enjoying our services on the %s plan from %s to %s.',
  },
  '0000-0110': {
    title: 'Low Credits Notice.',
    message: 'Your organization has few credits available. You have %s credits left.',
  },
  '0000-0111': {
    title: 'Invitation Resent.',
    message: 'The invitation for %s has been successfully resent; once it is accepted you will receive a notification.',
  },
  '0000-0112': {
    title: 'No Credits Available.',
    message: 'Your organization has run out of credits. Buy credits or upgrade your plan to keep running workflows.',
  },
  '0000-0113': {
    title: 'Overage Limit Reached.',
    message: 'The workflow cannot run because the overage limit was reached (%s/%s).',
  },
  '0000-0114': {
    title: 'Human Intervention Required.',
    message: 'Conversation %s of workflow %s requires human attention. Reason: %s.',
  },
  '0000-0115': {
    title: 'Conversation Needs Follow-up.',
    message: 'Conversation %s of workflow %s was flagged for follow-up. Reason: %s.',
  },
  '0000-0116': {
    title: 'Integration Lost Access.',
    message: 'The integration %s (%s) lost access and your agent can no longer use it. Someone revoked the permission or changed the account password. It was connected by %s; to restore it you need to reconnect it from Integrations.',
  },
  '0000-0117': {
    title: 'Payment Failed.',
    message: 'We could not charge your subscription. You have %s days to update your payment method before your workflows stop running.',
  },
  '0000-0118': {
    title: 'Service Suspended For Non-Payment.',
    message: 'Your subscription is still unpaid and you can no longer run workflows. Your credit balance was not lost: it will be reactivated as soon as you update your payment method.',
  },
  '0000-0119': {
    title: 'Credit Top-up.',
    message: '%s credits were added to your organization after your purchase.',
  },
  '0000-1000': {
    title: 'Invitation Accepted.',
    message: 'The invitation for %s has been successfully processed and accepted, so they are now part of your organization. You can manage their information from the admin panel.',
  },
};
