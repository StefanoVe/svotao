import { Component } from '@angular/core';
import { FormArray, FormControl, FormGroup, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import {
  LiquidGlassContainer,
  UploadComponent,
} from 'vecholib/angular/components';
import { TailwindFormsModule } from 'vecholib/angular/modules';
@Component({
  imports: [
    RouterModule,
    LiquidGlassContainer,
    TailwindFormsModule,
    UploadComponent,
  ],
  selector: 'svotao-p2p-share-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  public form = new FormGroup({
    file: new FormArray([
      new FormGroup({
        description: new FormControl('', Validators.required),
        checked: new FormControl(false),
      }),
    ]),
  });
}
