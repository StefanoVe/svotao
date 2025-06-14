import { CommonModule } from '@angular/common';
import { Component, ViewEncapsulation } from '@angular/core';

@Component({
  selector: 'app-nx-welcome',
  imports: [CommonModule],
  template: ` <div class="bg-red-500">a</div> `,
  styles: [],
  encapsulation: ViewEncapsulation.None,
})
export class NxWelcome {}
