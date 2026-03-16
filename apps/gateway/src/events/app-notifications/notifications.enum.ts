import { UserRole } from "@tesseract/types";

export const notificationsEnum = {
  // Subscription / Billing - Sensitive (Owner/Admin)
  '0000-0001': buildNotification(
    'Subscripción',
    'Felicidades, de ahora en adelante cuentas con la subscripcion %s, la cual comienza hoy %s. El proximo pago se realizara automaticamente el %s en caso de que desee continuar con los beneficios del paquete. Estamos muy contentos de tenerte en nuestra aplicación ya que formas parte fundamental de ella. Gracias por tu confianza.',
    [UserRole.OWNER, UserRole.ADMIN],
  ),
  '0000-0010': buildNotification(
    'Invitación De Email.',
    'La invitación para %s fue exitosamente enviada, tan pronto como el email invitado acepte la invitación, te lo haremos saber a traves de una notificación.',
    [UserRole.OWNER, UserRole.ADMIN],
  ),
  '0000-0011': buildNotification(
    'Cancelación De Invitación.',
    'La invitación para %s ha sido reenviada exitosamente, por favor revisa tu correo electrónico.',
    [UserRole.OWNER, UserRole.ADMIN],
  ),
  '0000-0100': buildNotification(
    'Cancelación De Subscripción.',
    'La subscripcion %s ha sido cancelada. Muchas gracias por la preferencia, sigue disfrutando nuestros servicios en el plan free.',
    [UserRole.OWNER, UserRole.ADMIN],
  ),
  '0000-0101': buildNotification(
    'Cambio De Subscripción.',
    'La subscripcion %s ha sido cambiada (aún asi los beneficios de esta no seran cancelados hasta el inicio de la siguiente subscripción). Muchas gracias por la preferencia, sigue disfrutando nuestros servicios en el plan %s a partir de %s al %s.',
    [UserRole.OWNER, UserRole.ADMIN],
  ),
  '0000-0110': buildNotification(
    'Aviso De Consumo.',
    'Lamentamos informarte que los creditos disponibles para tu actual subscripcion %s estan por sobrepasar el limite. Para nosostros es de vital importancia ofrecerte un servicio continuo sin interrupciones, por lo cual tu servicio continuara funcionando sin problema alguno bajo el concepto pay as you go, es decir que se cargara el costo extra solamente de los creditos que exedan el limite del plan en tu proximo pago. El costo que se cargara por cada credito extra es de $0.01 USD, por lo cual si excedes el limite en 100 creditos, se te cobrara $%s extra en tu proximo pago.',
    [UserRole.OWNER, UserRole.ADMIN],
  ),
  '0000-0111': buildNotification(
    'Reenvio De Invitación.',
    'La invitación para %s ha sido exitosamente reenviada, una vez que sea aceptada recibiras una notificación.',
    [UserRole.OWNER, UserRole.ADMIN],
  ),
  '0000-1000': buildNotification(
    'Aceptación De Invitación.',
    'La invitación para %s ha sido exitosamente procesada y aceptada por lo que ahora es parte de tu organización. Puedes gestionar su información desde el panel de administración.',
    [UserRole.OWNER, UserRole.ADMIN],
  ),
};

function buildNotification(
  title: string,
  desc: string,
  targetRoles: UserRole[] = [UserRole.OWNER, UserRole.ADMIN], // Default
) {
  return {
    title,
    desc,
    targetRoles,
  };
}
