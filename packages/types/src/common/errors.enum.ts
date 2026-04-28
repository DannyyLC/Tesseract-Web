export const OPERATIONS = {
    ACCEPT_INVITATION: 'accept-invitation-screen',
    RESEND_INVITATION: 'resend-invitation',
    CANCEL_INVITATION: 'cancel-invitation',
} as const;

export const ErrorStrings = {
    [OPERATIONS.ACCEPT_INVITATION]: {
        INVITATION_EXPIRED: 'La invitación expiró, por favor contacta a tu administrador para obtener una nueva.',
        SERVER_ERROR: 'El servidor está teniendo problemas, por favor intenta nuevamente más tarde.',
    },
    [OPERATIONS.RESEND_INVITATION]: {
        NO_INVITATION: 'No se encontró una invitación pendiente para el correo proporcionado.',
        SERVER_ERROR: 'No se pudo reenviar la invitación, error del servidor, por favor intenta nuevamente.'
    },
    [OPERATIONS.CANCEL_INVITATION]: {
        CANCEL_FAILED: 'No se encontró ninguna invitación pendiente para el correo proporcionado.',
    },
} as const;

