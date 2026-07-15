// Region of a team badge image where the club name is printed as part of
// the artwork, expressed in percent of the image's natural dimensions so it
// stays correct regardless of how large the badge is rendered on screen.
export interface CrestTextBox {
  top: number;
  left: number;
  width: number;
  height: number;
}
