export const notificationsEnum = {
  // Subscription / Billing - Sensitive (Owner/Admin)
  '0000-0001': buildNotification(
    'Subscripción',
    'Felicidades, de ahora en adelante cuentas con la subscripcion %s, la cual comienza hoy %s. El proximo pago se realizara automaticamente el %s en caso de que desee continuar con los beneficios del paquete. Estamos muy contentos de tenerte en nuestra aplicación ya que formas parte fundamental de ella. Gracias por tu confianza.',
    ['owner', 'admin'],
  ),
  '0000-0010': buildNotification(
    'Invitación De Email.',
    'La invitación para %s fue exitosamente enviada, tan pronto como el email invitado acepte la invitación, te lo haremos saber a traves de una notificación.',
    ['owner', 'admin'],
  ),
  '0000-0011': buildNotification(
    'Cancelación De Invitación.',
    'La invitación para %s ha sido reenviada exitosamente, por favor revisa tu correo electrónico.',
    ['owner', 'admin'],
  ),
  '0000-0100': buildNotification(
    'Cancelación De Subscripción.',
    'La subscripcion %s ha sido cancelada. Muchas gracias por la preferencia, sigue disfrutando nuestros servicios en el plan free',
    ['owner', 'admin'],
  ),
  '0000-0101': buildNotification(
    'Cambio De Subscripción.',
    'La subscripcion %s ha sido reanudada. Muchas gracias por la preferencia, sigue disfrutando nuestros servicios en el plan %s',
    ['owner', 'admin'],
  ),
  '0000-0110': buildNotification(
    'Aviso De Consumo.',
    'El pago de la subscripción %s ha sido exitoso, el pago se realizó el %s por un monto de %s. Muchas gracias por la preferencia, sigue disfrutando nuestros servicios en el plan %s',
    ['owner', 'admin'],
  ),
  '0000-0111': buildNotification(
    'Reenvio De Invitación.',
    'La invitación para %s ha sido exitosamente reenviada, una vez que sea aceptada recibiras una notificación.',
    ['owner', 'admin'],
  ),
  '0000-1000': buildNotification(
    'Aceptación De Invitación.',
    'La invitación para %s ha sido exitosamente procesada y aceptada por lo que ahora es parte de tu organización. Puedes gestionar su información desde el panel de administración.',
    ['owner', 'admin'],
  ),
};

function buildNotification(
  title: string,
  desc: string,
  targetRoles: string[] = ['owner', 'admin'], // Default
) {
  return {
    title,
    desc,
    targetRoles,
  };
}
